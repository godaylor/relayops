import {
  DEFAULT_ROLE_NAMES,
  defaultRolePayloads,
  isPreS7GeneratedViewerPayload,
  RELAYOPS_ROLE_TEMPLATE_NAMES,
  relayOpsRoleTemplatePayloads,
} from "@kaneo/permissions";
import { eq, inArray, sql } from "drizzle-orm";
import db, { schema } from "../database";

/**
 * Backfill the editable default roles (viewer/member/admin) for every
 * workspace that's missing them. Runs on API startup after Drizzle
 * migrations.
 *
 * These three roles used to be static (compiled into better-auth's
 * `roles` config). They were converted to DB rows so admins can override
 * them per workspace, but that means existing workspaces, which were
 * created before the switch, have no rows yet. Without this backfill,
 * better-auth's dynamic-access-control resolution would treat them as
 * having an empty permission set on existing workspaces.
 *
 * Idempotent: only inserts rows that aren't already present.
 */
export async function seedDefaultWorkspaceRoles() {
  try {
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'workspace_role'
      ) AS exists;
    `);

    const exists =
      tableExists.rows[0]?.exists === true ||
      tableExists.rows[0]?.exists === "t";
    if (!exists) {
      console.log(
        "🛈 workspace_role table does not exist; skipping default-role seed.",
      );
      return;
    }

    const workspaces = await db
      .select({ id: schema.workspaceTable.id })
      .from(schema.workspaceTable);

    if (workspaces.length === 0) {
      return;
    }

    const now = new Date();
    const BATCH_SIZE = 1000;

    const existingViewers = await db
      .select({
        id: schema.workspaceRoleTable.id,
        permission: schema.workspaceRoleTable.permission,
      })
      .from(schema.workspaceRoleTable)
      .where(eq(schema.workspaceRoleTable.role, "viewer"));
    const viewerRoleUpgradeIds = existingViewers
      .filter((row) => isPreS7GeneratedViewerPayload(row.permission))
      .map((row) => row.id);
    for (let i = 0; i < viewerRoleUpgradeIds.length; i += BATCH_SIZE) {
      await db
        .update(schema.workspaceRoleTable)
        .set({
          permission: JSON.stringify(relayOpsRoleTemplatePayloads.viewer),
          updatedAt: now,
        })
        .where(
          inArray(
            schema.workspaceRoleTable.id,
            viewerRoleUpgradeIds.slice(i, i + BATCH_SIZE),
          ),
        );
    }

    const templates = {
      ...defaultRolePayloads,
      ...relayOpsRoleTemplatePayloads,
    };
    const names = [
      ...DEFAULT_ROLE_NAMES,
      ...RELAYOPS_ROLE_TEMPLATE_NAMES,
    ].filter((name, index, all) => all.indexOf(name) === index);
    const rows: Array<typeof schema.workspaceRoleTable.$inferInsert> = [];
    for (const workspace of workspaces) {
      for (const name of names) {
        rows.push({
          workspaceId: workspace.id,
          role: name,
          permission: JSON.stringify(templates[name]),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Postgres' bind protocol caps parameters at 65535 per query, so insert
    // in chunks. 6 columns × 1000 rows = 6000 params per batch, leaving ample
    // headroom even for instances with tens of thousands of workspaces.
    let insertedCount = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const inserted = await db
        .insert(schema.workspaceRoleTable)
        .values(rows.slice(i, i + BATCH_SIZE))
        .onConflictDoNothing({
          target: [
            schema.workspaceRoleTable.workspaceId,
            schema.workspaceRoleTable.role,
          ],
        })
        .returning({ id: schema.workspaceRoleTable.id });
      insertedCount += inserted.length;
    }
    console.log(
      `✅ Seeded ${insertedCount} missing workspace role row(s), upgraded ${viewerRoleUpgradeIds.length} generated viewer row(s), across ${workspaces.length} workspace(s).`,
    );
  } catch (error) {
    console.error("❌ Failed to seed default workspace roles:", error);
    throw error;
  }
}
