import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { recordWorkspaceRoleChanged } from "../../apps/api/src/relayops/authorization-audit";
import { seedDefaultWorkspaceRoles } from "../../apps/api/src/utils/seed-default-workspace-roles";
import {
  PRE_S7_GENERATED_VIEWER_PAYLOAD,
  RELAYOPS_ROLE_TEMPLATE_NAMES,
  relayOpsRoleTemplatePayloads,
} from "../../packages/permissions/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const accessPermissions = {
  service: ["read", "create"],
  incident: ["read", "create"],
  incident_timeline: ["read"],
  saved_view: ["read", "create", "update", "delete", "share"],
};

function apiKeyHash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

async function grantRole(
  workspaceId: string,
  userId: string,
  role: string,
  permissions: Record<string, string[]>,
) {
  await db
    .insert(schema.workspaceRoleTable)
    .values({
      workspaceId,
      role,
      permission: JSON.stringify(permissions),
    })
    .onConflictDoUpdate({
      target: [
        schema.workspaceRoleTable.workspaceId,
        schema.workspaceRoleTable.role,
      ],
      set: { permission: JSON.stringify(permissions), updatedAt: new Date() },
    });
  await db
    .update(schema.workspaceUserTable)
    .set({ role })
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    );
}

async function createService(app: App, workspaceId: string, name: string) {
  const response = await app.request(
    `/api/relayops/workspaces/${workspaceId}/services`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}`,
      }),
    },
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function createIncident(
  app: App,
  workspaceId: string,
  serviceId: string,
  title: string,
  severity: "sev1" | "sev2" | "sev3",
) {
  const response = await app.request(
    `/api/relayops/workspaces/${workspaceId}/incidents`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId,
        title,
        severity,
        impact: "degraded",
        idempotencyKey: `incident-${randomUUID()}`,
      }),
    },
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { incident: { id: string } };
}

function savedDefinition() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return {
    q: "",
    status: ["detected"],
    severity: [],
    service: [],
    commander: [],
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    sort: [{ field: "severity", direction: "desc" }],
    group: "none",
    density: "compact",
    columns: [{ id: "key", pin: "left", width: 112 }],
  };
}

async function createSameWorkspaceUser(workspaceId: string) {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name: "Second authorized user",
    })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: id,
    role: "s4-reader",
    joinedAt: new Date(),
  });
  return user;
}

describe("API integration: RelayOps S4 Workbench and S7 authorization", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps Workbench filtering, cursors, facets, workspace scope, and API-key scopes authoritative", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    await grantRole(
      member.workspace.id,
      member.user.id,
      "s4-access",
      accessPermissions,
    );
    const { app } = createApp();
    const checkout = await createService(app, member.workspace.id, "Checkout");
    const search = await createService(app, member.workspace.id, "Search");
    await createIncident(
      app,
      member.workspace.id,
      checkout.id,
      "Checkout latency",
      "sev1",
    );
    await createIncident(
      app,
      member.workspace.id,
      checkout.id,
      "Checkout errors",
      "sev2",
    );
    await createIncident(
      app,
      member.workspace.id,
      search.id,
      "Search lag",
      "sev3",
    );

    const other = await createWorkspaceMember({ role: "admin" });
    const [otherService] = await db
      .insert(schema.serviceTable)
      .values({
        workspaceId: other.workspace.id,
        name: "Private Other Service",
        slug: `other-${randomUUID()}`,
      })
      .returning();
    if (!otherService) throw new Error("Failed to create isolation service");
    await db.insert(schema.incidentTable).values({
      workspaceId: other.workspace.id,
      number: 1,
      title: "Private other incident",
      severity: "sev1",
      serviceId: otherService.id,
      creationIdempotencyKey: `other-${randomUUID()}`,
      createdBy: other.user.id,
    });

    const first = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/incidents?service=${checkout.id}&sort=-severity,title&limit=1`,
    );
    expect(first.status).toBe(200);
    const firstPage = (await first.json()) as {
      items: Array<{ id: string; title: string; service: { id: string } }>;
      nextCursor: string | null;
      facets: { service: Array<{ value: string; count: number }> };
    };
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.service.id).toBe(checkout.id);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.facets.service).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: checkout.id, count: 2 }),
      ]),
    );
    expect(
      firstPage.facets.service.some((facet) => facet.value === otherService.id),
    ).toBe(false);

    const second = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/incidents?service=${checkout.id}&sort=-severity,title&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
    );
    expect(second.status).toBe(200);
    const secondPage = (await second.json()) as {
      items: Array<{ id: string }>;
    };
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);

    const staleCursor = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/incidents?service=${search.id}&sort=-severity,title&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
    );
    expect(staleCursor.status).toBe(400);

    const deniedKey = "s4-denied-key";
    const allowedKey = "s4-allowed-key";
    const now = new Date();
    await db.insert(schema.apikeyTable).values([
      {
        id: "s4-denied-key-id",
        referenceId: member.user.id,
        userId: member.user.id,
        key: apiKeyHash(deniedKey),
        enabled: true,
        createdAt: now,
        updatedAt: now,
        permissions: JSON.stringify({ saved_view: ["read"] }),
      },
      {
        id: "s4-allowed-key-id",
        referenceId: member.user.id,
        userId: member.user.id,
        key: apiKeyHash(allowedKey),
        enabled: true,
        createdAt: now,
        updatedAt: now,
        permissions: JSON.stringify({ incident: ["read"] }),
      },
    ]);
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${member.workspace.id}/incidents`,
          { headers: { "x-api-key": deniedKey } },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${member.workspace.id}/incidents`,
          { headers: { "x-api-key": allowedKey } },
        )
      ).status,
    ).toBe(200);
  });

  it("enforces private/shared saved-view isolation and returns a compareable 409", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(owner.user);
    await grantRole(
      owner.workspace.id,
      owner.user.id,
      "s4-owner",
      accessPermissions,
    );
    const { app } = createApp();
    const definition = savedDefinition();
    const create = async (
      name: string,
      visibility: "private" | "workspace",
    ) => {
      const response = await app.request(
        `/api/relayops/workspaces/${owner.workspace.id}/saved-views`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, visibility, definition }),
        },
      );
      expect(response.status).toBe(201);
      return (await response.json()) as {
        id: string;
        version: number;
        name: string;
      };
    };
    const privateView = await create("Private view", "private");
    const sharedView = await create("Shared view", "workspace");

    const second = await createSameWorkspaceUser(owner.workspace.id);
    await grantRole(owner.workspace.id, second.id, "s4-reader", {
      incident: ["read"],
      saved_view: ["read", "update"],
    });
    mockAuthenticatedSession(second);
    const listAsSecond = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/saved-views`,
    );
    expect(listAsSecond.status).toBe(200);
    await expect(listAsSecond.json()).resolves.toMatchObject([
      { id: sharedView.id, visibility: "workspace" },
    ]);
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${owner.workspace.id}/saved-views/${sharedView.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expectedVersion: 1, name: "Forbidden" }),
          },
        )
      ).status,
    ).toBe(403);

    mockAuthenticatedSession(owner.user);
    const firstUpdate = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/saved-views/${privateView.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, name: "Private v2" }),
      },
    );
    expect(firstUpdate.status).toBe(200);
    const conflict = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/saved-views/${privateView.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, name: "Stale draft" }),
      },
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      code: "saved_view_version_conflict",
      current: { id: privateView.id, name: "Private v2", version: 2 },
    });
  });

  it("seeds role templates idempotently, preserves custom viewer grants, and writes redacted role audit evidence", async () => {
    const generated = await createWorkspaceMember({ role: "viewer" });
    const customized = await createWorkspaceMember({ role: "viewer" });
    await db.insert(schema.workspaceRoleTable).values([
      {
        workspaceId: generated.workspace.id,
        role: "viewer",
        permission: JSON.stringify(PRE_S7_GENERATED_VIEWER_PAYLOAD),
      },
      {
        workspaceId: customized.workspace.id,
        role: "viewer",
        permission: JSON.stringify({ service: ["read"], custom: ["keep"] }),
      },
    ]);

    await Promise.all([
      seedDefaultWorkspaceRoles(),
      seedDefaultWorkspaceRoles(),
    ]);
    const roles = await db.select().from(schema.workspaceRoleTable);
    for (const workspaceId of [
      generated.workspace.id,
      customized.workspace.id,
    ]) {
      for (const role of RELAYOPS_ROLE_TEMPLATE_NAMES) {
        expect(
          roles.filter(
            (row) => row.workspaceId === workspaceId && row.role === role,
          ),
        ).toHaveLength(1);
      }
    }
    const generatedViewer = roles.find(
      (row) =>
        row.workspaceId === generated.workspace.id && row.role === "viewer",
    );
    const customViewer = roles.find(
      (row) =>
        row.workspaceId === customized.workspace.id && row.role === "viewer",
    );
    expect(JSON.parse(generatedViewer?.permission ?? "null")).toEqual(
      relayOpsRoleTemplatePayloads.viewer,
    );
    expect(JSON.parse(customViewer?.permission ?? "null")).toEqual({
      service: ["read"],
      custom: ["keep"],
    });

    const now = new Date();
    await db.insert(schema.sessionTable).values([
      {
        id: "affected-session",
        token: "affected-token",
        userId: generated.user.id,
        activeOrganizationId: generated.workspace.id,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
      {
        id: "unrelated-session",
        token: "unrelated-token",
        userId: generated.user.id,
        activeOrganizationId: customized.workspace.id,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    ]);
    await recordWorkspaceRoleChanged({
      workspaceId: generated.workspace.id,
      actorUserId: customized.user.id,
      targetUserId: generated.user.id,
      previousRole: "viewer",
      nextRole: "responder",
      requestId: "role-change-request",
    });

    const audit = await db.select().from(schema.authorizationAuditEventTable);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      eventType: "workspace.role_changed",
      workspaceId: generated.workspace.id,
      actorUserId: customized.user.id,
      targetUserId: generated.user.id,
      previousRole: "viewer",
      nextRole: "responder",
      requestId: "role-change-request",
    });
    expect(JSON.stringify(audit[0])).not.toMatch(
      /email|permission|token|secret/i,
    );
    const sessions = await db
      .select({ id: schema.sessionTable.id })
      .from(schema.sessionTable)
      .where(eq(schema.sessionTable.userId, generated.user.id));
    expect(sessions).toEqual([{ id: "unrelated-session" }]);

    const duplicates = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count
      FROM (
        SELECT workspace_id, role
        FROM workspace_role
        GROUP BY workspace_id, role
        HAVING count(*) > 1
      ) duplicates
    `);
    expect(duplicates.rows[0]?.count).toBe("0");
  });
});
