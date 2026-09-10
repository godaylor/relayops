import { and, desc, eq, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import {
  type WorkbenchDefinition,
  workbenchDefinitionSchema,
} from "./workbench-schema";

type SavedViewWriteAccess = {
  canManageWorkspaceViews?: boolean;
  canShareWorkspaceViews?: boolean;
};

type SavedViewRow = typeof schema.savedViewTable.$inferSelect;

function databaseErrorCode(error: unknown) {
  const databaseError = error as {
    code?: string;
    cause?: { code?: string };
  };
  return databaseError.code ?? databaseError.cause?.code;
}

function serializeSavedView(row: SavedViewRow) {
  if (row.schemaVersion !== 1) return null;
  const definition = workbenchDefinitionSchema.safeParse(row.definition);
  if (!definition.success) return null;
  return {
    ...row,
    schemaVersion: 1 as const,
    visibility: row.visibility as "private" | "workspace",
    definition: definition.data,
  };
}

async function readableSavedView(
  workspaceId: string,
  userId: string,
  id: string,
) {
  const [row] = await db
    .select()
    .from(schema.savedViewTable)
    .where(
      and(
        eq(schema.savedViewTable.workspaceId, workspaceId),
        eq(schema.savedViewTable.id, id),
        eq(schema.savedViewTable.schemaVersion, 1),
        or(
          eq(schema.savedViewTable.ownerUserId, userId),
          eq(schema.savedViewTable.visibility, "workspace"),
        ),
      ),
    )
    .limit(1);
  const savedView = row ? serializeSavedView(row) : null;
  if (!savedView) {
    throw new HTTPException(404, { message: "Saved view not found" });
  }
  return savedView;
}

async function writableSavedView(
  workspaceId: string,
  userId: string,
  id: string,
  access: SavedViewWriteAccess,
) {
  const savedView = await readableSavedView(workspaceId, userId, id);
  if (savedView.ownerUserId === userId) return savedView;
  if (savedView.visibility === "workspace" && access.canManageWorkspaceViews) {
    return savedView;
  }
  throw new HTTPException(403, {
    message: "You cannot modify this saved view",
  });
}

function assertCanShare(
  visibility: "private" | "workspace",
  access: SavedViewWriteAccess,
) {
  if (visibility === "workspace" && !access.canShareWorkspaceViews) {
    throw new HTTPException(403, {
      message: "Workspace saved-view sharing is not permitted",
    });
  }
}

export async function isSavedViewOwner(
  workspaceId: string,
  userId: string,
  id: string,
) {
  if (!workspaceId || !userId || !id) return false;
  const [row] = await db
    .select({ id: schema.savedViewTable.id })
    .from(schema.savedViewTable)
    .where(
      and(
        eq(schema.savedViewTable.workspaceId, workspaceId),
        eq(schema.savedViewTable.id, id),
        eq(schema.savedViewTable.ownerUserId, userId),
        eq(schema.savedViewTable.schemaVersion, 1),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listSavedViews(workspaceId: string, userId: string) {
  const rows = await db
    .select()
    .from(schema.savedViewTable)
    .where(
      and(
        eq(schema.savedViewTable.workspaceId, workspaceId),
        eq(schema.savedViewTable.schemaVersion, 1),
        or(
          eq(schema.savedViewTable.ownerUserId, userId),
          eq(schema.savedViewTable.visibility, "workspace"),
        ),
      ),
    )
    .orderBy(
      desc(schema.savedViewTable.updatedAt),
      desc(schema.savedViewTable.id),
    );
  return rows.flatMap((row) => {
    const savedView = serializeSavedView(row);
    return savedView ? [savedView] : [];
  });
}

export async function createSavedView(
  workspaceId: string,
  userId: string,
  input: {
    name: string;
    visibility: "private" | "workspace";
    definition: WorkbenchDefinition;
  },
  access: SavedViewWriteAccess = {},
) {
  assertCanShare(input.visibility, access);
  try {
    const [created] = await db
      .insert(schema.savedViewTable)
      .values({
        workspaceId,
        ownerUserId: userId,
        name: input.name,
        visibility: input.visibility,
        schemaVersion: 1,
        definition: input.definition,
      })
      .returning();
    const savedView = created ? serializeSavedView(created) : null;
    if (!savedView) {
      throw new HTTPException(500, { message: "Saved view was not created" });
    }
    return savedView;
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new HTTPException(409, {
        message: "A saved view with this name already exists",
      });
    }
    throw error;
  }
}

export async function updateSavedView(
  workspaceId: string,
  userId: string,
  id: string,
  input: {
    expectedVersion: number;
    name?: string;
    visibility?: "private" | "workspace";
    definition?: WorkbenchDefinition;
  },
  access: SavedViewWriteAccess = {},
) {
  const current = await writableSavedView(workspaceId, userId, id, access);
  if (input.visibility) assertCanShare(input.visibility, access);
  if (current.version !== input.expectedVersion) {
    return { kind: "version_conflict" as const, current };
  }
  try {
    const [updated] = await db
      .update(schema.savedViewTable)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.visibility !== undefined
          ? { visibility: input.visibility }
          : {}),
        ...(input.definition !== undefined
          ? { definition: input.definition }
          : {}),
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.savedViewTable.workspaceId, workspaceId),
          eq(schema.savedViewTable.id, id),
          eq(schema.savedViewTable.version, input.expectedVersion),
          eq(schema.savedViewTable.schemaVersion, 1),
        ),
      )
      .returning();
    if (!updated) {
      return {
        kind: "version_conflict" as const,
        current: await readableSavedView(workspaceId, userId, id),
      };
    }
    const savedView = serializeSavedView(updated);
    if (!savedView) {
      throw new HTTPException(500, { message: "Saved view was not updated" });
    }
    return { kind: "updated" as const, savedView };
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new HTTPException(409, {
        message: "A saved view with this name already exists",
      });
    }
    throw error;
  }
}

export async function deleteSavedView(
  workspaceId: string,
  userId: string,
  id: string,
  expectedVersion: number,
  access: SavedViewWriteAccess = {},
) {
  const current = await writableSavedView(workspaceId, userId, id, access);
  if (current.version !== expectedVersion) {
    return { kind: "version_conflict" as const, current };
  }
  const [deleted] = await db
    .delete(schema.savedViewTable)
    .where(
      and(
        eq(schema.savedViewTable.workspaceId, workspaceId),
        eq(schema.savedViewTable.id, id),
        eq(schema.savedViewTable.version, expectedVersion),
        eq(schema.savedViewTable.schemaVersion, 1),
      ),
    )
    .returning({ id: schema.savedViewTable.id });
  if (!deleted) {
    return {
      kind: "version_conflict" as const,
      current: await readableSavedView(workspaceId, userId, id),
    };
  }
  return {
    kind: "deleted" as const,
    deleted: { deleted: true as const, id: deleted.id, deletedAt: new Date() },
  };
}
