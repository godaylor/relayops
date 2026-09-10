import { and, asc, eq, ilike, isNotNull, isNull, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

export type ServiceTier = "critical" | "high" | "standard" | "low";
export type ServiceHealth =
  | "operational"
  | "degraded"
  | "major_outage"
  | "maintenance";

export type ServiceInput = {
  name: string;
  slug: string;
  description?: string;
  tier?: ServiceTier;
  health?: ServiceHealth;
  ownerTeamId?: string | null;
  repositoryUrl?: string | null;
  runbookUrl?: string | null;
};

function conflict(message: string): never {
  throw new HTTPException(409, { message });
}

function handleConstraint(error: unknown): never {
  const databaseError = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const code = databaseError.code ?? databaseError.cause?.code;
  const constraint =
    databaseError.constraint ?? databaseError.cause?.constraint ?? "";
  if (code === "23505" && constraint.includes("active_slug")) {
    conflict("An active service with this slug already exists");
  }
  if (code === "23505") conflict("Service conflicts with an existing record");
  throw error;
}

async function assertOwnerTeam(
  workspaceId: string,
  ownerTeamId?: string | null,
) {
  if (!ownerTeamId) return;
  const [team] = await db
    .select({ id: schema.teamTable.id })
    .from(schema.teamTable)
    .where(
      and(
        eq(schema.teamTable.workspaceId, workspaceId),
        eq(schema.teamTable.id, ownerTeamId),
      ),
    )
    .limit(1);
  if (!team) throw new HTTPException(400, { message: "Owner team not found" });
}

function serviceSelection() {
  return {
    service: schema.serviceTable,
    ownerTeamName: schema.teamTable.name,
  };
}

function presentService<
  T extends { tier: string; health: string; demoDataSetId?: string | null },
>(service: T) {
  const { demoDataSetId: _demoDataSetId, ...safe } = service;
  return {
    ...safe,
    tier: service.tier as ServiceTier,
    health: service.health as ServiceHealth,
  };
}

export async function createService(workspaceId: string, input: ServiceInput) {
  await assertOwnerTeam(workspaceId, input.ownerTeamId);
  try {
    const [created] = await db
      .insert(schema.serviceTable)
      .values({
        workspaceId,
        name: input.name,
        slug: input.slug,
        description: input.description || null,
        tier: input.tier ?? "standard",
        health: input.health ?? "operational",
        ownerTeamId: input.ownerTeamId ?? null,
        repositoryUrl: input.repositoryUrl ?? null,
        runbookUrl: input.runbookUrl ?? null,
      })
      .returning();
    if (!created) {
      throw new HTTPException(500, { message: "Service was not created" });
    }
    return getService(workspaceId, created.id);
  } catch (error) {
    handleConstraint(error);
  }
}

export async function listServices(
  workspaceId: string,
  query: { q?: string; status: "active" | "archived" | "all" },
) {
  const archiveCondition =
    query.status === "active"
      ? isNull(schema.serviceTable.archivedAt)
      : query.status === "archived"
        ? isNotNull(schema.serviceTable.archivedAt)
        : undefined;
  const searchCondition = query.q
    ? or(
        ilike(schema.serviceTable.name, `%${query.q}%`),
        ilike(schema.serviceTable.slug, `%${query.q}%`),
      )
    : undefined;
  const rows = await db
    .select(serviceSelection())
    .from(schema.serviceTable)
    .leftJoin(
      schema.teamTable,
      and(
        eq(schema.serviceTable.workspaceId, schema.teamTable.workspaceId),
        eq(schema.serviceTable.ownerTeamId, schema.teamTable.id),
      ),
    )
    .where(
      and(
        eq(schema.serviceTable.workspaceId, workspaceId),
        archiveCondition,
        searchCondition,
      ),
    )
    .orderBy(asc(schema.serviceTable.name), asc(schema.serviceTable.id));
  return rows.map((row) => ({
    ...presentService(row.service),
    ownerTeamName: row.ownerTeamName,
  }));
}

export async function getService(workspaceId: string, id: string) {
  const [row] = await db
    .select(serviceSelection())
    .from(schema.serviceTable)
    .leftJoin(
      schema.teamTable,
      and(
        eq(schema.serviceTable.workspaceId, schema.teamTable.workspaceId),
        eq(schema.serviceTable.ownerTeamId, schema.teamTable.id),
      ),
    )
    .where(
      and(
        eq(schema.serviceTable.workspaceId, workspaceId),
        eq(schema.serviceTable.id, id),
      ),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Service not found" });
  return {
    ...presentService(row.service),
    ownerTeamName: row.ownerTeamName,
  };
}

export async function updateService(
  workspaceId: string,
  id: string,
  input: Partial<ServiceInput>,
) {
  await getService(workspaceId, id);
  await assertOwnerTeam(workspaceId, input.ownerTeamId);
  try {
    const [updated] = await db
      .update(schema.serviceTable)
      .set({
        name: input.name,
        slug: input.slug,
        description:
          input.description === undefined
            ? undefined
            : input.description || null,
        tier: input.tier,
        health: input.health,
        ownerTeamId: input.ownerTeamId,
        repositoryUrl: input.repositoryUrl,
        runbookUrl: input.runbookUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.serviceTable.workspaceId, workspaceId),
          eq(schema.serviceTable.id, id),
        ),
      )
      .returning();
    if (!updated) {
      throw new HTTPException(404, { message: "Service not found" });
    }
    return getService(workspaceId, updated.id);
  } catch (error) {
    handleConstraint(error);
  }
}

export async function archiveService(workspaceId: string, id: string) {
  const [updated] = await db
    .update(schema.serviceTable)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.serviceTable.workspaceId, workspaceId),
        eq(schema.serviceTable.id, id),
        isNull(schema.serviceTable.archivedAt),
      ),
    )
    .returning();
  if (!updated) {
    const current = await getService(workspaceId, id);
    if (current.archivedAt) conflict("Service is already archived");
  }
  return getService(workspaceId, id);
}

export async function unarchiveService(workspaceId: string, id: string) {
  const current = await getService(workspaceId, id);
  if (!current.archivedAt) conflict("Service is already active");
  try {
    await db
      .update(schema.serviceTable)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.serviceTable.workspaceId, workspaceId),
          eq(schema.serviceTable.id, id),
        ),
      );
    return getService(workspaceId, id);
  } catch (error) {
    handleConstraint(error);
  }
}

export async function listTeams(workspaceId: string) {
  return db
    .select({ id: schema.teamTable.id, name: schema.teamTable.name })
    .from(schema.teamTable)
    .where(eq(schema.teamTable.workspaceId, workspaceId))
    .orderBy(asc(schema.teamTable.name), asc(schema.teamTable.id));
}
