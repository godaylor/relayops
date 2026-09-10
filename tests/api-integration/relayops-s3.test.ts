import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];
type Detail = {
  incident: {
    id: string;
    status: string;
    severity: string;
    version: number;
    commanderId: string | null;
    resolutionSummary: string | null;
    detectedAt: string;
    acknowledgedAt: string | null;
    mitigatedAt: string | null;
    resolvedAt: string | null;
    dismissedAt: string | null;
  };
  commander: { id: string; name: string } | null;
  responders: Array<{ id: string; name: string }>;
  affectedServices: Array<{ id: string; name: string }>;
  timeline: Array<{
    id: string;
    type: string;
    incidentVersion: number;
    payload: Record<string, unknown>;
    occurredAt: string;
  }>;
};

const directPermissions = {
  incident: [
    "read",
    "update",
    "transition",
    "assign",
    "severity",
    "resolve",
    "reopen",
    "dismiss",
  ],
  incident_timeline: ["read", "publish", "correct"],
};

function apiKeyHash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

async function createService(
  app: App,
  workspaceId: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await app.request(
    `/api/relayops/workspaces/${workspaceId}/services`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "RelayOps Service",
        slug: `service-${randomUUID()}`,
        ...overrides,
      }),
    },
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; ownerTeamId: string | null };
}

async function createIncident(
  app: App,
  workspaceId: string,
  serviceId: string,
) {
  const response = await app.request(
    `/api/relayops/workspaces/${workspaceId}/incidents`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId,
        title: "S3 integration incident",
        severity: "sev2",
        impact: "degraded",
        idempotencyKey: `create-${randomUUID()}`,
      }),
    },
  );
  expect(response.status).toBe(201);
  return (await response.json()) as Detail;
}

async function grantRole(
  workspaceId: string,
  userId: string,
  role: string,
  permissions: Record<string, string[]>,
) {
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId,
    role,
    permission: JSON.stringify(permissions),
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

async function command(
  app: App,
  workspaceId: string,
  incidentId: string,
  suffix: string,
  body: Record<string, unknown>,
  apiKey?: string,
) {
  return app.request(
    `/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}/${suffix}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

describe("API integration: RelayOps S3 lifecycle and durable timeline", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("enforces transitions, optimistic conflicts, and idempotent reopen retries", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = await createService(app, member.workspace.id);
    const created = await createIncident(app, member.workspace.id, service.id);
    await grantRole(
      member.workspace.id,
      member.user.id,
      "s3-direct",
      directPermissions,
    );

    const triageKey = `transition-${randomUUID()}`;
    const triaged = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "transition",
      { expectedVersion: 1, idempotencyKey: triageKey, to: "triaging" },
    );
    expect(triaged.status).toBe(200);
    await expect(triaged.clone().json()).resolves.toMatchObject({
      incident: {
        status: "triaging",
        version: 2,
        acknowledgedAt: expect.any(String),
      },
    });

    const retry = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "transition",
      { expectedVersion: 1, idempotencyKey: triageKey, to: "triaging" },
    );
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      incident: { status: "triaging", version: 2 },
    });

    const forbidden = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "transition",
      {
        expectedVersion: 2,
        idempotencyKey: `forbidden-${randomUUID()}`,
        to: "detected",
      },
    );
    expect(forbidden.status).toBe(422);

    const concurrent = await Promise.all([
      command(app, member.workspace.id, created.incident.id, "transition", {
        expectedVersion: 2,
        idempotencyKey: `concurrent-a-${randomUUID()}`,
        to: "mitigating",
      }),
      command(app, member.workspace.id, created.incident.id, "transition", {
        expectedVersion: 2,
        idempotencyKey: `concurrent-b-${randomUUID()}`,
        to: "monitoring",
      }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winnerResponse = concurrent.find(
      (response) => response.status === 200,
    );
    const conflictResponse = concurrent.find(
      (response) => response.status === 409,
    );
    let current = (await winnerResponse?.json()) as Detail;
    await expect(conflictResponse?.json()).resolves.toMatchObject({
      code: "version_conflict",
      current: { incident: { id: created.incident.id, version: 3 } },
    });

    if (current.incident.status === "mitigating") {
      const monitoring = await command(
        app,
        member.workspace.id,
        created.incident.id,
        "transition",
        {
          expectedVersion: current.incident.version,
          idempotencyKey: `monitor-${randomUUID()}`,
          to: "monitoring",
        },
      );
      expect(monitoring.status).toBe(200);
      current = (await monitoring.json()) as Detail;
    }

    const resolved = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "transition",
      {
        expectedVersion: current.incident.version,
        idempotencyKey: `resolve-${randomUUID()}`,
        to: "resolved",
        resolutionSummary: "Rollback completed and latency recovered.",
      },
    );
    expect(resolved.status).toBe(200);
    current = (await resolved.json()) as Detail;
    expect(current.incident).toMatchObject({
      status: "resolved",
      resolutionSummary: "Rollback completed and latency recovered.",
      resolvedAt: expect.any(String),
    });

    const reopenKey = `reopen-${randomUUID()}`;
    const reopened = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "transition",
      {
        expectedVersion: current.incident.version,
        idempotencyKey: reopenKey,
        to: "monitoring",
      },
    );
    expect(reopened.status).toBe(200);
    current = (await reopened.json()) as Detail;
    expect(current.incident).toMatchObject({
      status: "monitoring",
      resolutionSummary: null,
      resolvedAt: null,
    });

    const reopenRetry = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "transition",
      {
        expectedVersion: current.incident.version - 1,
        idempotencyKey: reopenKey,
        to: "monitoring",
      },
    );
    expect(reopenRetry.status).toBe(200);
    await expect(reopenRetry.json()).resolves.toMatchObject({
      incident: { version: current.incident.version, status: "monitoring" },
    });
    expect(await db.$count(schema.incidentEventTable)).toBe(
      current.incident.version,
    );
    expect(await db.$count(schema.outboxEventTable)).toBe(
      current.incident.version,
    );
  });

  it("rolls back a lifecycle mutation when the outbox insert fails", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = await createService(app, member.workspace.id);
    const created = await createIncident(app, member.workspace.id, service.id);
    await grantRole(
      member.workspace.id,
      member.user.id,
      "s3-rollback",
      directPermissions,
    );

    await db.execute(
      sql`create function relayops_s3_reject_outbox() returns trigger language plpgsql as $$ begin raise exception 'reject S3 outbox'; end $$`,
    );
    await db.execute(
      sql`create trigger relayops_s3_reject_outbox before insert on outbox_event for each row execute function relayops_s3_reject_outbox()`,
    );
    try {
      const response = await command(
        app,
        member.workspace.id,
        created.incident.id,
        "transition",
        {
          expectedVersion: 1,
          idempotencyKey: `rollback-${randomUUID()}`,
          to: "triaging",
        },
      );
      expect(response.status).toBe(500);
      const [persisted] = await db
        .select()
        .from(schema.incidentTable)
        .where(eq(schema.incidentTable.id, created.incident.id));
      expect(persisted).toMatchObject({ status: "detected", version: 1 });
      expect(await db.$count(schema.incidentEventTable)).toBe(1);
      expect(await db.$count(schema.outboxEventTable)).toBe(1);
    } finally {
      await db.execute(
        sql`drop trigger relayops_s3_reject_outbox on outbox_event`,
      );
      await db.execute(sql`drop function relayops_s3_reject_outbox()`);
    }
  });

  it("keeps assignments and corrections durable, scoped, and cursor-paginated", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const primary = await createService(app, member.workspace.id);
    const secondary = await createService(app, member.workspace.id);
    const created = await createIncident(app, member.workspace.id, primary.id);
    const otherIncident = await createIncident(
      app,
      member.workspace.id,
      secondary.id,
    );
    const createdEvent = created.timeline[0];

    const other = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(other.user);
    const crossWorkspaceService = await createService(app, other.workspace.id);
    mockAuthenticatedSession(member.user);
    await grantRole(
      member.workspace.id,
      member.user.id,
      "s3-timeline",
      directPermissions,
    );

    const assigned = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "participants",
      {
        expectedVersion: 1,
        idempotencyKey: `assign-${randomUUID()}`,
        commanderId: member.user.id,
        responderIds: [member.user.id, member.user.id],
        affectedServiceIds: [secondary.id],
      },
    );
    expect(assigned.status).toBe(200);
    let current = (await assigned.json()) as Detail;
    expect(current).toMatchObject({
      incident: { version: 2, commanderId: member.user.id },
      commander: { id: member.user.id },
      responders: [{ id: member.user.id }],
      affectedServices: [{ id: secondary.id }],
    });

    for (const message of [
      "Investigating database saturation",
      "Replica recovered",
    ]) {
      const update = await command(
        app,
        member.workspace.id,
        created.incident.id,
        "updates",
        {
          expectedVersion: current.incident.version,
          idempotencyKey: `update-${randomUUID()}`,
          message,
        },
      );
      expect(update.status).toBe(200);
      current = (await update.json()) as Detail;
    }

    const correctedDetectedAt = new Date(
      Date.parse(current.incident.detectedAt) - 60_000,
    ).toISOString();
    const corrected = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "timestamps/correct",
      {
        expectedVersion: current.incident.version,
        idempotencyKey: `correction-${randomUUID()}`,
        reason: "Provider clock was one minute slow",
        detectedAt: correctedDetectedAt,
      },
    );
    expect(corrected.status).toBe(200);
    current = (await corrected.json()) as Detail;
    expect(current.incident.detectedAt).toBe(correctedDetectedAt);
    expect(
      current.timeline.find((event) => event.id === createdEvent?.id),
    ).toEqual(createdEvent);
    expect(current.timeline.at(-1)).toMatchObject({
      type: "incident.timestamps_corrected",
      payload: {
        reason: "Provider clock was one minute slow",
        before: expect.any(Object),
        after: expect.any(Object),
      },
    });

    const crossWorkspace = await command(
      app,
      member.workspace.id,
      created.incident.id,
      "participants",
      {
        expectedVersion: current.incident.version,
        idempotencyKey: `cross-workspace-${randomUUID()}`,
        affectedServiceIds: [crossWorkspaceService.id],
      },
    );
    expect(crossWorkspace.status).toBe(422);

    const firstResponse = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/incidents/${created.incident.id}/timeline?limit=2`,
    );
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));

    const secondResponse = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/incidents/${created.incident.id}/timeline?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
    );
    expect(secondResponse.status).toBe(200);
    const second = (await secondResponse.json()) as {
      items: Array<{ id: string }>;
    };
    expect(
      new Set([...first.items, ...second.items].map((event) => event.id)).size,
    ).toBe(first.items.length + second.items.length);

    const wrongScope = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/incidents/${otherIncident.incident.id}/timeline?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
    );
    expect(wrongScope.status).toBe(400);
  });

  it("uses only primary-service ownership and never commander assignment for owned rights", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const now = new Date();
    await db.insert(schema.teamTable).values([
      {
        id: "s3-primary-team",
        name: "Primary owners",
        workspaceId: member.workspace.id,
        createdAt: now,
      },
      {
        id: "s3-secondary-team",
        name: "Secondary owners",
        workspaceId: member.workspace.id,
        createdAt: now,
      },
    ]);
    await db.insert(schema.teamMemberTable).values({
      id: "s3-primary-member",
      teamId: "s3-primary-team",
      userId: member.user.id,
      createdAt: now,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = await createService(app, member.workspace.id, {
      ownerTeamId: "s3-primary-team",
    });
    const secondaryService = await createService(app, member.workspace.id, {
      ownerTeamId: "s3-secondary-team",
    });
    const created = await createIncident(app, member.workspace.id, service.id);
    await db.insert(schema.incidentAffectedServiceTable).values({
      workspaceId: member.workspace.id,
      incidentId: created.incident.id,
      serviceId: secondaryService.id,
    });
    await grantRole(member.workspace.id, member.user.id, "s3-owner", {
      incident: [
        "read",
        "transition_owned",
        "assign_owned",
        "severity_owned",
        "resolve_owned",
        "reopen_owned",
        "dismiss_owned",
        "update_owned",
      ],
    });

    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "transition",
          {
            expectedVersion: 1,
            idempotencyKey: `owned-transition-${randomUUID()}`,
            to: "triaging",
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "severity",
          {
            expectedVersion: 2,
            idempotencyKey: `owned-severity-${randomUUID()}`,
            severity: "sev3",
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "severity",
          {
            expectedVersion: 3,
            idempotencyKey: `owned-sev1-${randomUUID()}`,
            severity: "sev1",
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "participants",
          {
            expectedVersion: 3,
            idempotencyKey: `owned-assign-${randomUUID()}`,
            commanderId: member.user.id,
          },
        )
      ).status,
    ).toBe(200);

    await grantRole(member.workspace.id, member.user.id, "s3-read-only", {
      incident: ["read"],
    });
    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "transition",
          {
            expectedVersion: 4,
            idempotencyKey: `commander-denied-${randomUUID()}`,
            to: "mitigating",
          },
        )
      ).status,
    ).toBe(403);

    await grantRole(member.workspace.id, member.user.id, "s3-secondary-owner", {
      incident: ["read", "transition_owned"],
    });
    await db
      .delete(schema.teamMemberTable)
      .where(eq(schema.teamMemberTable.id, "s3-primary-member"));
    await db.insert(schema.teamMemberTable).values({
      id: "s3-secondary-member",
      teamId: "s3-secondary-team",
      userId: member.user.id,
      createdAt: now,
    });
    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "transition",
          {
            expectedVersion: 4,
            idempotencyKey: `secondary-denied-${randomUUID()}`,
            to: "mitigating",
          },
        )
      ).status,
    ).toBe(403);
  });

  it("requires both workspace role and API-key scope for lifecycle commands", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = await createService(app, member.workspace.id);
    const created = await createIncident(app, member.workspace.id, service.id);
    await grantRole(member.workspace.id, member.user.id, "s3-api-role", {
      incident: ["read", "transition"],
    });

    const now = new Date();
    const deniedKey = ["test", "denied", "key"].join("-");
    const allowedKey = ["test", "allowed", "key"].join("-");
    await db.insert(schema.apikeyTable).values([
      {
        id: "relayops-s3-denied",
        referenceId: member.user.id,
        userId: member.user.id,
        key: apiKeyHash(deniedKey),
        enabled: true,
        createdAt: now,
        updatedAt: now,
        permissions: JSON.stringify({ incident: ["read"] }),
      },
      {
        id: "relayops-s3-allowed",
        referenceId: member.user.id,
        userId: member.user.id,
        key: apiKeyHash(allowedKey),
        enabled: true,
        createdAt: now,
        updatedAt: now,
        permissions: JSON.stringify({ incident: ["read", "transition"] }),
      },
    ]);

    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "transition",
          {
            expectedVersion: 1,
            idempotencyKey: `api-denied-${randomUUID()}`,
            to: "triaging",
          },
          deniedKey,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await command(
          app,
          member.workspace.id,
          created.incident.id,
          "transition",
          {
            expectedVersion: 1,
            idempotencyKey: `api-allowed-${randomUUID()}`,
            to: "triaging",
          },
          allowedKey,
        )
      ).status,
    ).toBe(200);
  });

  it("exposes the additive S3 columns, tables, and indexes", async () => {
    const columns = await db.execute<{ column_name: string }>(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'incident'
        and column_name in (
          'impact', 'commander_id', 'resolution_summary',
          'acknowledged_at', 'mitigated_at', 'resolved_at', 'dismissed_at'
        )
    `);
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([
      "acknowledged_at",
      "commander_id",
      "dismissed_at",
      "impact",
      "mitigated_at",
      "resolution_summary",
      "resolved_at",
    ]);

    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('incident_affected_service', 'incident_responder')
    `);
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "incident_affected_service",
      "incident_responder",
    ]);

    const indexes = await db.execute<{ indexname: string }>(sql`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'incident_workspace_status_severity_detected_idx',
          'incident_workspace_last_update_idx',
          'incident_workspace_commander_idx'
        )
    `);
    expect(indexes.rows.map((row) => row.indexname).sort()).toEqual([
      "incident_workspace_commander_idx",
      "incident_workspace_last_update_idx",
      "incident_workspace_status_severity_detected_idx",
    ]);
  });
});
