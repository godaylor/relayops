import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { processRelayOpsOutboxBatch } from "../../apps/api/src/relayops/outbox-worker";
import { signWebhookBody } from "../../apps/api/src/relayops/signals/crypto";
import { relayOpsRoleTemplatePayloads } from "../../packages/permissions/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

async function createRelayOpsWorkspaceAdmin() {
  const member = await createWorkspaceMember({ role: "workspace_admin" });
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: member.workspace.id,
    role: "workspace_admin",
    permission: JSON.stringify(relayOpsRoleTemplatePayloads.workspace_admin),
  });
  return member;
}

function apiKeyHash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

async function createService(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
) {
  return app.request(`/api/relayops/workspaces/${workspaceId}/services`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Checkout API", slug: "checkout-api" }),
  });
}

async function createIncident(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
  serviceId: string,
  idempotencyKey = "relayops-request-1",
) {
  return app.request(`/api/relayops/workspaces/${workspaceId}/incidents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      serviceId,
      title: "Checkout latency",
      severity: "sev2",
      idempotencyKey,
    }),
  });
}

describe("API integration: RelayOps vertical tracer", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates and reads a workspace-scoped service and atomic incident timeline", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const serviceResponse = await createService(app, member.workspace.id);
    expect(serviceResponse.status).toBe(201);
    const service =
      (await serviceResponse.json()) as typeof schema.serviceTable.$inferSelect;

    const incidentResponse = await createIncident(
      app,
      member.workspace.id,
      service.id,
    );
    expect(incidentResponse.status).toBe(201);
    const detail = (await incidentResponse.json()) as {
      incident: { id: string; key: string };
      timeline: Array<{ type: string }>;
    };
    expect(detail.incident.key).toBe("INC-1");
    expect(detail.timeline).toEqual([
      expect.objectContaining({ type: "incident.created" }),
    ]);

    const persisted = await Promise.all([
      db
        .select()
        .from(schema.incidentTable)
        .where(eq(schema.incidentTable.id, detail.incident.id)),
      db
        .select()
        .from(schema.incidentEventTable)
        .where(eq(schema.incidentEventTable.incidentId, detail.incident.id)),
      db
        .select()
        .from(schema.outboxEventTable)
        .where(eq(schema.outboxEventTable.aggregateId, detail.incident.id)),
    ]);
    expect(persisted.map((rows) => rows.length)).toEqual([1, 1, 1]);

    const read = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/incidents/${detail.incident.id}`,
    );
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      incident: { id: detail.incident.id },
      timeline: [{ type: "incident.created" }],
    });
  });

  it("is idempotent and never duplicates timeline or outbox records", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = (await (
      await createService(app, member.workspace.id)
    ).json()) as { id: string };
    const first = await createIncident(
      app,
      member.workspace.id,
      service.id,
      "same-request-key",
    );
    const second = await createIncident(
      app,
      member.workspace.id,
      service.id,
      "same-request-key",
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(
      ((await first.json()) as { incident: { id: string } }).incident.id,
    ).toBe(((await second.json()) as { incident: { id: string } }).incident.id);
    expect(await db.$count(schema.incidentTable)).toBe(1);
    expect(await db.$count(schema.incidentEventTable)).toBe(1);
    expect(await db.$count(schema.outboxEventTable)).toBe(1);
  });

  it("returns the documented conflict for a duplicate service slug", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await createService(app, member.workspace.id)).status).toBe(201);
    expect((await createService(app, member.workspace.id)).status).toBe(409);
    expect(await db.$count(schema.serviceTable)).toBe(1);
  });

  it("does not leak services or incidents across workspaces", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const other = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const service = (await (
      await createService(app, owner.workspace.id)
    ).json()) as { id: string };
    const incident = (await (
      await createIncident(app, owner.workspace.id, service.id)
    ).json()) as { incident: { id: string } };

    mockAuthenticatedSession(other.user);
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${other.workspace.id}/services/${service.id}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${other.workspace.id}/incidents/${incident.incident.id}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${owner.workspace.id}/incidents/${incident.incident.id}`,
        )
      ).status,
    ).toBe(403);
  });

  it("ingests isolated manual, demo, and signed webhook signals idempotently", async () => {
    vi.stubEnv("RELAYOPS_WEBHOOK_ENCRYPTION_KEY", `hex:${"11".repeat(32)}`);
    try {
      const owner = await createWorkspaceMember({ role: "owner" });
      const other = await createWorkspaceMember({ role: "owner" });
      mockAuthenticatedSession(owner.user);
      const { app } = createApp();
      const service = (await (
        await createService(app, owner.workspace.id)
      ).json()) as { id: string };
      const incident = (await (
        await createIncident(
          app,
          owner.workspace.id,
          service.id,
          "signal-incident-request",
        )
      ).json()) as { incident: { id: string; version: number } };

      const manualBody = {
        idempotencyKey: "manual-signal-request",
        serviceId: service.id,
        title: "Checkout errors token=top-secret",
        severityHint: "sev2",
        payload: {
          metric: "http.errors",
          labels: { region: "eu-central", token: "never-store-me" },
        },
      };
      const manual = await app.request(
        `/api/relayops/workspaces/${owner.workspace.id}/signals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(manualBody),
        },
      );
      expect(manual.status).toBe(201);
      const manualResult = (await manual.json()) as {
        signal: {
          id: string;
          title: string;
          redactedPayload: Record<string, unknown>;
        };
        deduplicated: boolean;
      };
      expect(manualResult).toMatchObject({
        deduplicated: false,
        signal: {
          title: "Checkout errors token=[REDACTED]",
          redactedPayload: {
            metric: "http.errors",
            labels: { region: "eu-central" },
          },
        },
      });
      expect(JSON.stringify(manualResult)).not.toContain("never-store-me");

      const manualReplay = await app.request(
        `/api/relayops/workspaces/${owner.workspace.id}/signals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(manualBody),
        },
      );
      expect(manualReplay.status).toBe(201);
      await expect(manualReplay.json()).resolves.toMatchObject({
        deduplicated: true,
        signal: { id: manualResult.signal.id },
      });

      const demoPath = `/api/relayops/workspaces/${owner.workspace.id}/signals/demo`;
      const demoBody = JSON.stringify({ serviceId: service.id });
      const demo = await app.request(demoPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: demoBody,
      });
      const demoReplay = await app.request(demoPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: demoBody,
      });
      expect(demo.status).toBe(201);
      expect(demoReplay.status).toBe(201);
      await expect(demoReplay.json()).resolves.toMatchObject({
        deduplicated: true,
      });

      const sourceResponse = await app.request(
        `/api/relayops/workspaces/${owner.workspace.id}/signal-sources`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Generic monitor" }),
        },
      );
      expect(sourceResponse.status).toBe(201);
      const source = (await sourceResponse.json()) as {
        id: string;
        secret: string;
      };
      expect(JSON.stringify(source)).not.toMatch(/encryptedSecret|nonce/i);

      const timestamp = Math.floor(Date.now() / 1_000).toString();
      const rawBody = Buffer.from(
        JSON.stringify({
          externalId: "alert-42",
          serviceId: service.id,
          title: "Signed checkout alert",
          severityHint: "sev1",
          payload: { metric: "latency", token: "do-not-persist" },
        }),
        "utf8",
      );
      const webhookHeaders = {
        "content-type": "application/json",
        "x-relayops-timestamp": timestamp,
        "x-relayops-signature": signWebhookBody(
          source.secret,
          timestamp,
          rawBody,
        ),
      };
      const webhookPath = `/api/webhooks/${source.id}/signals`;
      const webhook = await app.request(webhookPath, {
        method: "POST",
        headers: { ...webhookHeaders, "x-request-id": "webhook-request-1" },
        body: rawBody,
      });
      expect(webhook.status).toBe(202);
      await expect(webhook.json()).resolves.toMatchObject({
        accepted: true,
        deduplicated: false,
      });

      const replayedRequest = await app.request(webhookPath, {
        method: "POST",
        headers: { ...webhookHeaders, "x-request-id": "webhook-request-1" },
        body: rawBody,
      });
      expect(replayedRequest.status).toBe(409);
      const duplicatePayload = await app.request(webhookPath, {
        method: "POST",
        headers: { ...webhookHeaders, "x-request-id": "webhook-request-2" },
        body: rawBody,
      });
      expect(duplicatePayload.status).toBe(202);
      await expect(duplicatePayload.json()).resolves.toMatchObject({
        accepted: true,
        deduplicated: true,
      });
      expect(await db.$count(schema.signalIngestionAttemptTable)).toBe(2);

      mockAuthenticatedSession(other.user);
      const otherList = await app.request(
        `/api/relayops/workspaces/${other.workspace.id}/signals`,
      );
      expect(otherList.status).toBe(200);
      await expect(otherList.json()).resolves.toEqual([]);
      expect(
        (
          await app.request(
            `/api/relayops/workspaces/${owner.workspace.id}/signals`,
          )
        ).status,
      ).toBe(403);

      mockAuthenticatedSession(owner.user);
      const attach = await app.request(
        `/api/relayops/workspaces/${owner.workspace.id}/incidents/${incident.incident.id}/signals/${manualResult.signal.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: incident.incident.version,
            idempotencyKey: "attach-signal-request",
          }),
        },
      );
      expect(attach.status).toBe(200);
      await expect(attach.json()).resolves.toMatchObject({
        attached: true,
        incidentVersion: incident.incident.version + 1,
        signal: { ingestionStatus: "attached" },
      });
      expect(await db.$count(schema.incidentSignalTable)).toBe(1);
      const attachedEvents = await db
        .select()
        .from(schema.incidentEventTable)
        .where(eq(schema.incidentEventTable.type, "incident.signal_attached"));
      const attachedOutbox = await db
        .select()
        .from(schema.outboxEventTable)
        .where(
          eq(schema.outboxEventTable.eventType, "incident.signal_attached"),
        );
      expect([attachedEvents.length, attachedOutbox.length]).toEqual([1, 1]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rolls back incident and timeline when the outbox write fails", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = (await (
      await createService(app, member.workspace.id)
    ).json()) as { id: string };
    await db.execute(
      sql`create function relayops_reject_outbox() returns trigger language plpgsql as $$ begin raise exception 'reject outbox'; end $$`,
    );
    await db.execute(
      sql`create trigger relayops_reject_outbox before insert on outbox_event for each row execute function relayops_reject_outbox()`,
    );
    try {
      expect(
        (await createIncident(app, member.workspace.id, service.id)).status,
      ).toBe(500);
      expect(await db.$count(schema.incidentTable)).toBe(0);
      expect(await db.$count(schema.incidentEventTable)).toBe(0);
      expect(await db.$count(schema.outboxEventTable)).toBe(0);
    } finally {
      await db.execute(
        sql`drop trigger relayops_reject_outbox on outbox_event`,
      );
      await db.execute(sql`drop function relayops_reject_outbox()`);
    }
  });

  it("leases safely across concurrent workers, recovers stale claims, and does not republish", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = (await (
      await createService(app, member.workspace.id)
    ).json()) as { id: string };
    await createIncident(app, member.workspace.id, service.id);
    await db.update(schema.outboxEventTable).set({
      claimedAt: new Date(Date.now() - 60_000),
      claimedBy: "dead-worker",
    });
    const publish = vi.fn().mockResolvedValue(undefined);
    const processed = await Promise.all([
      processRelayOpsOutboxBatch(publish),
      processRelayOpsOutboxBatch(publish),
    ]);
    expect(processed.reduce((total, count) => total + count, 0)).toBe(1);
    expect(publish).toHaveBeenCalledWith(
      member.user.id,
      expect.objectContaining({
        v: 1,
        type: "RELAYOPS_INCIDENT_INVALIDATED",
        eventType: "incident.created",
        workspaceId: member.workspace.id,
      }),
    );
    expect(await processRelayOpsOutboxBatch(publish)).toBe(0);
    expect(publish).toHaveBeenCalledTimes(1);
    const [outbox] = await db.select().from(schema.outboxEventTable);
    expect(outbox?.publishedAt).toBeInstanceOf(Date);

    await createIncident(
      app,
      member.workspace.id,
      service.id,
      "terminal-outbox-request",
    );
    await db
      .update(schema.outboxEventTable)
      .set({ attempts: 8, claimedAt: new Date(0), claimedBy: "dead-worker" })
      .where(sql`${schema.outboxEventTable.publishedAt} is null`);
    expect(await processRelayOpsOutboxBatch(publish)).toBe(0);
    const [terminal] = await db
      .select()
      .from(schema.outboxEventTable)
      .where(sql`${schema.outboxEventTable.publishedAt} is null`);
    expect(terminal?.attempts).toBe(8);
  });

  it("records publish failures and retries an available outbox event", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = (await (
      await createService(app, member.workspace.id)
    ).json()) as { id: string };
    await createIncident(app, member.workspace.id, service.id);
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("transport unavailable"))
      .mockResolvedValue(undefined);

    expect(await processRelayOpsOutboxBatch(publish)).toBe(1);
    let [outbox] = await db.select().from(schema.outboxEventTable);
    expect(outbox).toMatchObject({
      attempts: 1,
      publishedAt: null,
      lastError: "transport unavailable",
    });

    await db.update(schema.outboxEventTable).set({ availableAt: new Date(0) });
    expect(await processRelayOpsOutboxBatch(publish)).toBe(1);
    [outbox] = await db.select().from(schema.outboxEventTable);
    expect(outbox?.publishedAt).toBeInstanceOf(Date);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("supports Service ownership, update, filters, archive, reverse state, and slug conflicts", async () => {
    const member = await createRelayOpsWorkspaceAdmin();
    const other = await createWorkspaceMember({ role: "admin" });
    const now = new Date();
    await db.insert(schema.teamTable).values([
      {
        id: "team-primary",
        name: "Primary",
        workspaceId: member.workspace.id,
        createdAt: now,
      },
      {
        id: "team-other",
        name: "Other",
        workspaceId: other.workspace.id,
        createdAt: now,
      },
    ]);
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const createdResponse = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/services`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Checkout API",
          slug: "checkout-api",
          tier: "critical",
          health: "degraded",
          ownerTeamId: "team-primary",
          repositoryUrl: "https://github.com/example/checkout",
          runbookUrl: "https://ops.example.test/checkout",
        }),
      },
    );
    expect(createdResponse.status).toBe(201);
    const service = (await createdResponse.json()) as {
      id: string;
      ownerTeamName: string;
    };
    expect(service.ownerTeamName).toBe("Primary");

    const crossWorkspaceOwner = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/services/${service.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerTeamId: "team-other" }),
      },
    );
    expect(crossWorkspaceOwner.status).toBe(400);

    const updated = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/services/${service.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Checkout Platform",
          health: "operational",
        }),
      },
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      name: "Checkout Platform",
      health: "operational",
    });

    const filtered = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/services?q=platform&status=active`,
    );
    expect(filtered.status).toBe(200);
    expect(((await filtered.json()) as unknown[]).length).toBe(1);

    const archived = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/services/${service.id}/archive`,
      { method: "POST" },
    );
    expect(archived.status).toBe(200);
    const incidentOnArchived = await createIncident(
      app,
      member.workspace.id,
      service.id,
      "archived-service-request",
    );
    expect(incidentOnArchived.status).toBe(422);

    const replacement = await createService(app, member.workspace.id);
    expect(replacement.status).toBe(201);
    const blockedRestore = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/services/${service.id}/unarchive`,
      { method: "POST" },
    );
    expect(blockedRestore.status).toBe(409);
    const replacementId = ((await replacement.json()) as { id: string }).id;
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${member.workspace.id}/services/${replacementId}/archive`,
          { method: "POST" },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/relayops/workspaces/${member.workspace.id}/services/${service.id}/unarchive`,
          { method: "POST" },
        )
      ).status,
    ).toBe(200);
  });

  it("enforces Service write permissions for a denied persona", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    mockAuthenticatedSession(viewer.user);
    const { app } = createApp();
    expect((await createService(app, viewer.workspace.id)).status).toBe(403);
  });

  it("removes only provenance-marked demo rows in one authorized operation", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const service = (await (
      await createService(app, member.workspace.id)
    ).json()) as { id: string };
    const userIncident = (await (
      await createIncident(
        app,
        member.workspace.id,
        service.id,
        "user-incident",
      )
    ).json()) as { incident: { id: string } };
    const demo = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/demo-data`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceId: service.id }),
      },
    );
    expect(demo.status).toBe(201);
    await expect(demo.json()).resolves.toMatchObject({
      incident: { isDemo: true },
    });

    const cleanup = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/demo-data`,
      { method: "DELETE" },
    );
    expect(cleanup.status).toBe(200);
    await expect(cleanup.json()).resolves.toMatchObject({
      incidents: 1,
      services: 0,
      outboxEvents: 1,
    });
    expect(await db.$count(schema.serviceTable)).toBe(1);
    expect(await db.$count(schema.incidentTable)).toBe(1);
    const [remaining] = await db.select().from(schema.incidentTable);
    expect(remaining?.id).toBe(userIncident.incident.id);
    expect(await db.$count(schema.incidentEventTable)).toBe(1);
    expect(await db.$count(schema.outboxEventTable)).toBe(1);
  });

  it("activates the strangler path while preserving and exporting legacy data read-only", async () => {
    const member = await createRelayOpsWorkspaceAdmin();
    await db.insert(schema.projectTable).values({
      id: "preserved-project",
      workspaceId: member.workspace.id,
      slug: "preserved",
      name: "Preserved project",
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const activate = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/activate`,
      { method: "POST" },
    );
    expect(activate.status).toBe(200);
    await expect(activate.json()).resolves.toMatchObject({
      productMode: "relayops",
      legacyProjectCount: 1,
    });

    const legacyWrite = await app.request("/api/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: member.workspace.id,
        name: "Blocked",
        icon: "Folder",
        slug: "blocked",
      }),
    });
    expect(legacyWrite.status).toBe(409);

    const archive = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/legacy`,
    );
    expect(archive.status).toBe(200);
    await expect(archive.json()).resolves.toMatchObject({
      projects: [{ id: "preserved-project", taskCount: 0 }],
    });
    const exported = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/legacy/export`,
    );
    expect(exported.status).toBe(200);
    await expect(exported.json()).resolves.toMatchObject({
      schemaVersion: 1,
      workspaceId: member.workspace.id,
      projects: [{ id: "preserved-project" }],
    });
    expect(await db.$count(schema.projectTable)).toBe(1);
  });

  it("publishes the RelayOps routes in OpenAPI", async () => {
    const { app } = createApp();
    const response = await app.request("/api/openapi");
    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/relayops/workspaces/{workspaceId}/services",
        "/relayops/workspaces/{workspaceId}/services/{id}",
        "/relayops/workspaces/{workspaceId}/overview",
        "/relayops/workspaces/{workspaceId}/demo-data",
        "/relayops/workspaces/{workspaceId}/legacy",
        "/relayops/workspaces/{workspaceId}/incidents",
        "/relayops/workspaces/{workspaceId}/incidents/{id}",
      ]),
    );
  });

  it("enforces API key RelayOps scopes", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const rawKey = "relayops-test-api-key";
    const now = new Date();
    await db.insert(schema.apikeyTable).values({
      id: "relayops-key",
      referenceId: member.user.id,
      userId: member.user.id,
      key: apiKeyHash(rawKey),
      enabled: true,
      createdAt: now,
      updatedAt: now,
      permissions: JSON.stringify({ service: ["read"], incident: ["read"] }),
    });
    const { app } = createApp();
    const response = await app.request(
      `/api/relayops/workspaces/${member.workspace.id}/services`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": rawKey },
        body: JSON.stringify({ name: "Denied", slug: "denied" }),
      },
    );
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "Insufficient or invalid API key scope",
    );
  });

  it("upgrades an existing legacy database without changing its project data", async () => {
    const baseUrl = new URL(process.env.DATABASE_URL as string);
    const databaseName = `relayops_upgrade_${Date.now()}_test`;
    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = "/postgres";
    const targetUrl = new URL(baseUrl);
    targetUrl.pathname = `/${databaseName}`;
    const admin = new Client({ connectionString: adminUrl.toString() });
    const testDir = dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = resolve(testDir, "../../apps/api/drizzle");
    const baselineFolder = mkdtempSync(resolve(tmpdir(), "relayops-baseline-"));
    const metaFolder = resolve(baselineFolder, "meta");
    let pool: Pool | undefined;

    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    try {
      cpSync(resolve(migrationsFolder, "meta"), metaFolder, {
        recursive: true,
      });
      const journalPath = resolve(metaFolder, "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
        entries: Array<{ idx: number; tag: string }>;
      };
      journal.entries = journal.entries.filter((entry) => entry.idx <= 44);
      writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
      for (const entry of journal.entries) {
        cpSync(
          resolve(migrationsFolder, `${entry.tag}.sql`),
          resolve(baselineFolder, `${entry.tag}.sql`),
        );
      }

      pool = new Pool({ connectionString: targetUrl.toString() });
      const upgradeDb = drizzle(pool);
      await migrate(upgradeDb, { migrationsFolder: baselineFolder });
      await upgradeDb.execute(
        sql`insert into workspace (id, name, slug, created_at) values ('legacy-workspace', 'Legacy', 'legacy', now())`,
      );
      await upgradeDb.execute(
        sql`insert into project (id, workspace_id, slug, name) values ('legacy-project', 'legacy-workspace', 'legacy-project', 'Legacy project')`,
      );
      await migrate(upgradeDb, { migrationsFolder });

      const legacy = await upgradeDb.execute<{ name: string }>(
        sql`select name from project where id = 'legacy-project'`,
      );
      const relayopsTables = await upgradeDb.execute<{
        table_name: string;
      }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name in ('service', 'incident', 'incident_event', 'outbox_event')
      `);
      expect(legacy.rows).toEqual([{ name: "Legacy project" }]);
      expect(relayopsTables.rows.map((row) => row.table_name).sort()).toEqual([
        "incident",
        "incident_event",
        "outbox_event",
        "service",
      ]);
    } finally {
      await pool?.end();
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1",
        [databaseName],
      );
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
      rmSync(baselineFolder, { recursive: true, force: true });
    }
  });
});
