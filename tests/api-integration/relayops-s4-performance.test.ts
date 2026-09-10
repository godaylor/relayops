import { performance } from "node:perf_hooks";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const performanceIt = process.env.RELAYOPS_PERF === "1" ? it : it.skip;

describe("RelayOps S4 representative Workbench performance", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  performanceIt(
    "returns 50 rows under the 300ms p95 budget on 100k incidents and captures EXPLAIN BUFFERS",
    async () => {
      const member = await createWorkspaceMember({
        role: "performance-reader",
      });
      mockAuthenticatedSession(member.user);
      await db.insert(schema.workspaceRoleTable).values({
        workspaceId: member.workspace.id,
        role: "performance-reader",
        permission: JSON.stringify({ incident: ["read"] }),
      });
      const [service] = await db
        .insert(schema.serviceTable)
        .values({
          workspaceId: member.workspace.id,
          name: "Representative Service",
          slug: "representative-service",
        })
        .returning();
      if (!service) throw new Error("Failed to create performance service");

      await db.execute(sql`
        INSERT INTO incident (
          id,
          workspace_id,
          number,
          title,
          summary,
          status,
          severity,
          impact,
          service_id,
          version,
          creation_idempotency_key,
          created_by,
          detected_at,
          last_update_at,
          created_at,
          updated_at
        )
        SELECT
          'perf-incident-' || series,
          ${member.workspace.id},
          series,
          'Representative incident ' || series,
          'Bounded fixture row ' || series,
          (ARRAY['detected','triaging','mitigating','monitoring','resolved','dismissed'])[(series % 6) + 1],
          (ARRAY['unknown','sev1','sev2','sev3','sev4'])[(series % 5) + 1],
          'degraded',
          ${service.id},
          1,
          'perf-key-' || series,
          ${member.user.id},
          now() - ((series % 30) * interval '1 day'),
          now() - ((series % 1440) * interval '1 minute'),
          now(),
          now()
        FROM generate_series(1, 100000) AS series
      `);
      await db.execute(sql`ANALYZE incident`);

      const planResult = await db.execute<Record<string, unknown>>(sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT incident.id
        FROM incident
        INNER JOIN service
          ON incident.workspace_id = service.workspace_id
         AND incident.service_id = service.id
        LEFT JOIN "user" commander ON incident.commander_id = commander.id
        WHERE incident.workspace_id = ${member.workspace.id}
          AND incident.status IN ('detected','triaging','mitigating','monitoring')
        ORDER BY
          CASE incident.severity
            WHEN 'sev1' THEN 5
            WHEN 'sev2' THEN 4
            WHEN 'sev3' THEN 3
            WHEN 'sev4' THEN 2
            ELSE 1
          END DESC,
          incident.detected_at DESC,
          incident.id ASC
        LIMIT 51
      `);
      const plan = planResult.rows[0]?.["QUERY PLAN"];

      const { app } = createApp();
      for (let index = 0; index < 3; index += 1) {
        const warmup = await app.request(
          `/api/relayops/workspaces/${member.workspace.id}/incidents?limit=50`,
        );
        expect(warmup.status).toBe(200);
      }
      const durations: number[] = [];
      for (let index = 0; index < 20; index += 1) {
        const started = performance.now();
        const response = await app.request(
          `/api/relayops/workspaces/${member.workspace.id}/incidents?limit=50`,
        );
        durations.push(performance.now() - started);
        expect(response.status).toBe(200);
        const body = (await response.json()) as { items: unknown[] };
        expect(body.items).toHaveLength(50);
      }
      durations.sort((left, right) => left - right);
      const p95 =
        durations[Math.ceil(durations.length * 0.95) - 1] ??
        Number.POSITIVE_INFINITY;
      console.log(
        `RELAYOPS_S4_PERF ${JSON.stringify({ incidents: 100000, samples: durations.length, p95Ms: Number(p95.toFixed(2)), minMs: Number((durations[0] ?? 0).toFixed(2)), maxMs: Number((durations.at(-1) ?? 0).toFixed(2)), explainAnalyzeBuffers: plan })}`,
      );
      expect(p95).toBeLessThanOrEqual(300);

      const count = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.incidentTable)
        .where(eq(schema.incidentTable.workspaceId, member.workspace.id));
      expect(Number(count[0]?.count)).toBe(100_000);
      expect(
        await db
          .select({ id: schema.workspaceRoleTable.id })
          .from(schema.workspaceRoleTable)
          .where(
            and(
              eq(schema.workspaceRoleTable.workspaceId, member.workspace.id),
              eq(schema.workspaceRoleTable.role, "performance-reader"),
            ),
          ),
      ).toHaveLength(1);
    },
    120_000,
  );
});
