import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import db from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";

describe("RelayOps S4/S7 migration contract", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it("creates saved views, role audit evidence, and uniqueness on a fresh database", async () => {
    const tables = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('saved_view', 'authorization_audit_event')
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "authorization_audit_event",
      "saved_view",
    ]);

    const indexes = await db.execute<{ indexname: string }>(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'saved_view_workspace_visibility_updated_idx',
          'saved_view_workspace_owner_updated_idx',
          'authorization_audit_workspace_created_idx',
          'workspace_role_workspace_role_unique'
        )
      ORDER BY indexname
    `);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "authorization_audit_workspace_created_idx",
      "saved_view_workspace_owner_updated_idx",
      "saved_view_workspace_visibility_updated_idx",
      "workspace_role_workspace_role_unique",
    ]);

    const constraints = await db.execute<{ constraint_name: string }>(sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND constraint_name IN (
          'saved_view_schema_version_supported',
          'saved_view_version_positive',
          'saved_view_visibility_valid',
          'workspace_role_workspace_role_unique'
        )
      ORDER BY constraint_name
    `);
    expect(constraints.rows.map((row) => row.constraint_name)).toEqual([
      "saved_view_schema_version_supported",
      "saved_view_version_positive",
      "saved_view_visibility_valid",
      "workspace_role_workspace_role_unique",
    ]);
  });
});
