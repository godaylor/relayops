import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const performanceIt = process.env.RELAYOPS_PERF === "1" ? it : it.skip;

describe("RelayOps S9 representative reliability performance", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  performanceIt(
    "aggregates 100k incidents and 1M durable events under the 300ms p95 budget",
    async () => {
      const owner = await createWorkspaceMember({ role: "owner" });
      mockAuthenticatedSession(owner.user);
      const [service] = await db
        .execute<{ id: string }>(sql`
        insert into service (id, workspace_id, name, slug, created_at, updated_at)
        values ('perf-s9-service', ${owner.workspace.id}, 'Reliability fixture', 'reliability-fixture', now(), now())
        returning id
      `)
        .then((result) => result.rows);
      if (!service) throw new Error("Failed to create performance service");

      await db.execute(sql`
        insert into incident (
          id, workspace_id, number, title, summary, status, severity, impact,
          service_id, version, creation_idempotency_key, created_by,
          detected_at, acknowledged_at, mitigated_at, resolved_at,
          last_update_at, created_at, updated_at
        )
        select
          'perf-s9-incident-' || series,
          ${owner.workspace.id},
          series,
          'Reliability incident ' || series,
          'Representative aggregate fixture',
          (array['detected','triaging','mitigating','monitoring','resolved'])[(series % 5) + 1],
          (array['sev1','sev2','sev3','sev4'])[(series % 4) + 1],
          'degraded',
          ${service.id},
          10,
          'perf-s9-key-' || series,
          ${owner.user.id},
          '2026-08-01T00:00:00Z'::timestamptz + ((series % 30) * interval '1 day'),
          '2026-08-01T00:05:00Z'::timestamptz + ((series % 30) * interval '1 day'),
          '2026-08-01T00:15:00Z'::timestamptz + ((series % 30) * interval '1 day'),
          '2026-08-01T01:00:00Z'::timestamptz + ((series % 30) * interval '1 day'),
          '2026-08-01T01:00:00Z'::timestamptz + ((series % 30) * interval '1 day'),
          now(),
          now()
        from generate_series(1, 100000) as series
      `);

      await db.execute(sql`
        insert into incident_event (
          id, workspace_id, incident_id, incident_version, type,
          actor_user_id, occurred_at, payload, idempotency_key
        )
        select
          'perf-s9-event-' || series,
          ${owner.workspace.id},
          'perf-s9-incident-' || (((series - 1) / 10) + 1),
          ((series - 1) % 10) + 1,
          (array[
            'incident.created',
            'incident.status_changed',
            'incident.severity_changed',
            'incident.assignment_changed',
            'incident.update_published',
            'incident.timestamps_corrected',
            'incident.resolved',
            'incident.dismissed',
            'incident.reopened',
            'incident.signal_attached'
          ])[((series - 1) % 10) + 1],
          ${owner.user.id},
          '2026-08-01T00:00:00Z'::timestamptz
            + ((((series - 1) / 10) % 30) * interval '1 day')
            + ((((series - 1) % 10) + 1) * interval '1 minute'),
          '{}'::jsonb,
          'perf-s9-event-key-' || series
        from generate_series(1, 1000000) as series
      `);
      await db.execute(sql`analyze incident`);
      await db.execute(sql`vacuum (analyze) incident_event`);

      const planResult = await db.execute<Record<string, unknown>>(sql`
        explain (analyze, buffers, format json)
        with resolutions as (
          select
            incident_id,
            min(occurred_at) as first_resolved_at
          from incident_event
          where workspace_id = ${owner.workspace.id}
            and type = 'incident.resolved'
          group by incident_id
        ), reopened as (
          select distinct incident_id from incident_event
          where workspace_id = ${owner.workspace.id} and type = 'incident.reopened'
        ), filtered as (
          select i.*,
            coalesce(events.first_resolved_at, i.resolved_at) as effective_resolved_at,
            (reopened.incident_id is not null) as reopened
          from incident i
          left join resolutions events on events.incident_id = i.id
          left join reopened on reopened.incident_id = i.id
          where i.workspace_id = ${owner.workspace.id}
            and i.detected_at >= '2026-08-01T00:00:00Z'::timestamptz
            and i.detected_at < '2026-09-01T00:00:00Z'::timestamptz
            and i.demo_data_set_id is null
        )
        select
          count(*)::int,
          percentile_cont(0.5) within group (
            order by extract(epoch from (acknowledged_at - detected_at))::double precision * 1000
          ) filter (where acknowledged_at >= detected_at),
          percentile_cont(0.5) within group (
            order by extract(epoch from (effective_resolved_at - detected_at))::double precision * 1000
          ) filter (where effective_resolved_at >= detected_at),
          count(*) filter (where reopened)::int
        from filtered
      `);
      const explainAnalyzeBuffers = planResult.rows[0]?.["QUERY PLAN"];

      const { app } = createApp();
      const path = `/api/relayops/workspaces/${owner.workspace.id}/analytics/reliability?from=2026-08-01&to=2026-08-31&timezone=UTC&compare=false`;
      for (let index = 0; index < 3; index += 1) {
        expect((await app.request(path)).status).toBe(200);
      }

      const durations: number[] = [];
      for (let index = 0; index < 20; index += 1) {
        const started = performance.now();
        const response = await app.request(path);
        durations.push(performance.now() - started);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
          metrics: { volume: { count: 100_000 } },
          comparison: null,
        });
      }
      durations.sort((left, right) => left - right);
      const p95 =
        durations[Math.ceil(durations.length * 0.95) - 1] ??
        Number.POSITIVE_INFINITY;
      console.log(
        `RELAYOPS_S9_PERF ${JSON.stringify({ incidents: 100000, events: 1000000, samples: durations.length, p95Ms: Number(p95.toFixed(2)), minMs: Number((durations[0] ?? 0).toFixed(2)), maxMs: Number((durations.at(-1) ?? 0).toFixed(2)), explainAnalyzeBuffers })}`,
      );
      expect(p95).toBeLessThanOrEqual(300);
    },
    180_000,
  );
});
