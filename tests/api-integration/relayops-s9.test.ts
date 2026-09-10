import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const minute = 60_000;

async function seedIncident(input: {
  workspaceId: string;
  serviceId: string;
  userId: string;
  number: number;
  detectedAt: Date;
  acknowledgedMinutes?: number;
  mitigatedMinutes?: number;
  resolvedMinutes?: number;
  reopened?: boolean;
  status?: "detected" | "monitoring" | "resolved";
  severity?: "sev1" | "sev2" | "sev3";
  demo?: boolean;
}) {
  const id = `s9-incident-${randomUUID()}`;
  const resolvedAt =
    input.resolvedMinutes === undefined
      ? null
      : new Date(input.detectedAt.valueOf() + input.resolvedMinutes * minute);
  const version = input.reopened ? 3 : resolvedAt ? 2 : 1;
  await db.insert(schema.incidentTable).values({
    id,
    workspaceId: input.workspaceId,
    number: input.number,
    title: `Reliability incident ${input.number}`,
    status: input.status ?? (resolvedAt ? "resolved" : "detected"),
    severity: input.severity ?? "sev2",
    impact: "degraded",
    serviceId: input.serviceId,
    version,
    creationIdempotencyKey: `s9-${randomUUID()}`,
    demoDataSetId: input.demo ? "relayops-demo-v1" : null,
    createdBy: input.userId,
    detectedAt: input.detectedAt,
    acknowledgedAt:
      input.acknowledgedMinutes === undefined
        ? null
        : new Date(
            input.detectedAt.valueOf() + input.acknowledgedMinutes * minute,
          ),
    mitigatedAt:
      input.mitigatedMinutes === undefined
        ? null
        : new Date(
            input.detectedAt.valueOf() + input.mitigatedMinutes * minute,
          ),
    resolvedAt: input.reopened ? null : resolvedAt,
    lastUpdateAt: new Date(input.detectedAt.valueOf() + 4 * 60 * minute),
  });
  if (resolvedAt) {
    await db.insert(schema.incidentEventTable).values({
      workspaceId: input.workspaceId,
      incidentId: id,
      incidentVersion: 2,
      type: "incident.resolved",
      actorUserId: input.userId,
      occurredAt: resolvedAt,
      payload: { from: "monitoring", to: "resolved" },
      idempotencyKey: `s9-resolved-${randomUUID()}`,
    });
  }
  if (input.reopened && resolvedAt) {
    await db.insert(schema.incidentEventTable).values({
      workspaceId: input.workspaceId,
      incidentId: id,
      incidentVersion: 3,
      type: "incident.reopened",
      actorUserId: input.userId,
      occurredAt: new Date(resolvedAt.valueOf() + 5 * minute),
      payload: { from: "resolved", to: "monitoring" },
      idempotencyKey: `s9-reopened-${randomUUID()}`,
    });
  }
  return id;
}

describe("RelayOps S9 reliability analytics", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("aggregates, compares, filters, isolates and authorizes CSV export", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const other = await createWorkspaceMember({ role: "owner" });
    const viewer = await createWorkspaceMember({ role: "viewer" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: viewer.user.id,
      role: "viewer",
      joinedAt: new Date(),
    });
    const [serviceA, serviceB, otherService] = await Promise.all([
      db
        .insert(schema.serviceTable)
        .values({
          workspaceId: owner.workspace.id,
          name: "Checkout",
          slug: "checkout",
        })
        .returning()
        .then((rows) => rows[0]!),
      db
        .insert(schema.serviceTable)
        .values({
          workspaceId: owner.workspace.id,
          name: "Identity",
          slug: "identity",
        })
        .returning()
        .then((rows) => rows[0]!),
      db
        .insert(schema.serviceTable)
        .values({
          workspaceId: other.workspace.id,
          name: "Other private service",
          slug: "private",
        })
        .returning()
        .then((rows) => rows[0]!),
    ]);

    await seedIncident({
      workspaceId: owner.workspace.id,
      serviceId: serviceA.id,
      userId: owner.user.id,
      number: 1,
      detectedAt: new Date("2026-03-10T12:00:00.000Z"),
      acknowledgedMinutes: 10,
      mitigatedMinutes: 20,
      resolvedMinutes: 60,
      severity: "sev1",
    });
    await seedIncident({
      workspaceId: owner.workspace.id,
      serviceId: serviceA.id,
      userId: owner.user.id,
      number: 2,
      detectedAt: new Date("2026-03-11T12:00:00.000Z"),
      acknowledgedMinutes: 20,
      mitigatedMinutes: 30,
      resolvedMinutes: 120,
      reopened: true,
      status: "monitoring",
    });
    await seedIncident({
      workspaceId: owner.workspace.id,
      serviceId: serviceB.id,
      userId: owner.user.id,
      number: 3,
      detectedAt: new Date("2026-03-12T12:00:00.000Z"),
      severity: "sev3",
    });
    await seedIncident({
      workspaceId: owner.workspace.id,
      serviceId: serviceB.id,
      userId: owner.user.id,
      number: 4,
      detectedAt: new Date("2026-03-13T12:00:00.000Z"),
      acknowledgedMinutes: 1,
      mitigatedMinutes: 2,
      resolvedMinutes: 3,
      demo: true,
    });
    await seedIncident({
      workspaceId: owner.workspace.id,
      serviceId: serviceA.id,
      userId: owner.user.id,
      number: 5,
      detectedAt: new Date("2026-02-10T12:00:00.000Z"),
      acknowledgedMinutes: 5,
      mitigatedMinutes: 10,
      resolvedMinutes: 15,
    });
    await seedIncident({
      workspaceId: other.workspace.id,
      serviceId: otherService.id,
      userId: other.user.id,
      number: 1,
      detectedAt: new Date("2026-03-10T12:00:00.000Z"),
      acknowledgedMinutes: 1,
      mitigatedMinutes: 2,
      resolvedMinutes: 3,
    });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const query = "from=2026-03-01&to=2026-03-31&timezone=America%2FNew_York";
    const response = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/analytics/reliability?${query}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      generatedAt: string;
      period: { startAt: string; endAt: string };
      metrics: {
        volume: { count: number };
        mtta: { sampleSize: number; excludedMissing: number; p50Ms: number };
        mttr: { sampleSize: number; p50Ms: number; p90Ms: number };
        mitigation: { p50Ms: number };
        reopen: { numerator: number; denominator: number; percent: number };
        stale: { numerator: number; denominator: number; percent: number };
      };
      comparison: { metrics: { volume: { count: number } } };
      hotspots: Array<{ serviceId: string; incidentCount: number }>;
    };
    expect(body.period).toMatchObject({
      startAt: "2026-03-01T05:00:00.000Z",
      endAt: "2026-04-01T04:00:00.000Z",
    });
    expect(body.metrics.volume.count).toBe(3);
    expect(body.metrics.mtta).toMatchObject({
      sampleSize: 2,
      excludedMissing: 1,
      p50Ms: 15 * minute,
    });
    expect(body.metrics.mttr).toMatchObject({
      sampleSize: 2,
      p50Ms: 90 * minute,
      p90Ms: 114 * minute,
    });
    expect(body.metrics.mitigation.p50Ms).toBe(25 * minute);
    expect(body.metrics.reopen).toEqual({
      numerator: 1,
      denominator: 2,
      percent: 50,
    });
    expect(body.metrics.stale).toEqual({
      numerator: 2,
      denominator: 2,
      percent: 100,
    });
    expect(body.comparison.metrics.volume.count).toBe(1);
    expect(body.hotspots[0]).toMatchObject({
      serviceId: serviceA.id,
      incidentCount: 2,
    });

    const serviceFilter = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/analytics/reliability?${query}&service=${serviceB.id}&compare=false`,
    );
    expect(serviceFilter.status).toBe(200);
    await expect(serviceFilter.json()).resolves.toMatchObject({
      metrics: { volume: { count: 1 } },
      comparison: null,
    });

    const csv = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/analytics/reliability.csv?${query}`,
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-disposition")).toContain(
      "relayops-reliability-2026-03-01-2026-03-31.csv",
    );
    const csvText = await csv.text();
    expect(csvText).toContain(
      "definition_version,generated_at,timezone,filter_spec",
    );
    expect(csvText).toContain("relayops-reliability-v1");
    expect(csvText).toContain("America/New_York");
    expect(csvText).not.toContain("Other private service");
    expect(csvText).not.toContain("Reliability incident 4");

    mockAuthenticatedSession(viewer.user);
    const viewerRead = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/analytics/reliability?${query}`,
    );
    expect(viewerRead.status).toBe(200);
    const deniedExport = await app.request(
      `/api/relayops/workspaces/${owner.workspace.id}/analytics/reliability.csv?${query}`,
    );
    expect(deniedExport.status).toBe(403);
  });
});
