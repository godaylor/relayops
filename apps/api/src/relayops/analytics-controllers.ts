import { type SQL, sql } from "drizzle-orm";
import db from "../database";
import {
  previousReliabilityPeriod,
  type ReliabilityAnalyticsQuery,
  type ResolvedReliabilityAnalyticsQuery,
  resolveReliabilityAnalyticsQuery,
} from "./analytics-schema";

export const RELIABILITY_DEFINITION_VERSION =
  "relayops-reliability-v1" as const;
export const RELIABILITY_STALE_THRESHOLD_HOURS = 24 as const;

export const RELIABILITY_FORMULAS = {
  mtta: "acknowledged_at - detected_at; missing or negative durations excluded",
  mttr: "first durable resolution - detected_at; current resolved_at is used when no resolution event exists",
  mitigation:
    "mitigated_at - detected_at; missing or negative durations excluded",
  reopen:
    "incidents with a durable incident.reopened event / incidents with a durable resolution",
  stale:
    "active incidents whose last_update_at is more than 24 hours before the period reference instant / active incidents",
  volume: "incidents detected in the inclusive local-calendar period",
} as const;

type Period = {
  from: string;
  to: string;
  startAt: Date;
  endAt: Date;
};

type AggregateRow = {
  volume: number | string;
  mtta_sample_size: number | string;
  mtta_average_ms: number | string | null;
  mtta_p50_ms: number | string | null;
  mtta_p90_ms: number | string | null;
  mttr_sample_size: number | string;
  mttr_average_ms: number | string | null;
  mttr_p50_ms: number | string | null;
  mttr_p90_ms: number | string | null;
  mitigation_sample_size: number | string;
  mitigation_average_ms: number | string | null;
  mitigation_p50_ms: number | string | null;
  mitigation_p90_ms: number | string | null;
  reopened_count: number | string;
  resolved_base_count: number | string;
  stale_count: number | string;
  active_count: number | string;
};

function number(value: number | string | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function integer(value: number | string | null | undefined) {
  return Math.max(0, Math.trunc(number(value) ?? 0));
}

function percent(numerator: number, denominator: number) {
  return denominator === 0
    ? null
    : Number(((numerator / denominator) * 100).toFixed(2));
}

export function summarizeReliabilityAggregate(row: AggregateRow) {
  const volume = integer(row.volume);
  const duration = (
    sampleSize: number | string,
    averageMs: number | string | null,
    p50Ms: number | string | null,
    p90Ms: number | string | null,
  ) => ({
    sampleSize: integer(sampleSize),
    excludedMissing: Math.max(0, volume - integer(sampleSize)),
    averageMs: number(averageMs),
    p50Ms: number(p50Ms),
    p90Ms: number(p90Ms),
  });
  const reopened = integer(row.reopened_count);
  const resolvedBase = integer(row.resolved_base_count);
  const stale = integer(row.stale_count);
  const active = integer(row.active_count);
  return {
    volume: { count: volume },
    mtta: duration(
      row.mtta_sample_size,
      row.mtta_average_ms,
      row.mtta_p50_ms,
      row.mtta_p90_ms,
    ),
    mttr: duration(
      row.mttr_sample_size,
      row.mttr_average_ms,
      row.mttr_p50_ms,
      row.mttr_p90_ms,
    ),
    mitigation: duration(
      row.mitigation_sample_size,
      row.mitigation_average_ms,
      row.mitigation_p50_ms,
      row.mitigation_p90_ms,
    ),
    reopen: {
      numerator: reopened,
      denominator: resolvedBase,
      percent: percent(reopened, resolvedBase),
    },
    stale: {
      numerator: stale,
      denominator: active,
      percent: percent(stale, active),
    },
  };
}

function inList(column: SQL, values: readonly string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql.raw(", "),
  )})`;
}

function filterSql(
  workspaceId: string,
  input: ResolvedReliabilityAnalyticsQuery,
  period: Period,
) {
  const conditions: SQL[] = [
    sql`i.workspace_id = ${workspaceId}`,
    sql`i.detected_at >= ${period.startAt}`,
    sql`i.detected_at < ${period.endAt}`,
  ];
  if (!input.includeDemo) conditions.push(sql`i.demo_data_set_id is null`);
  if (input.status?.length)
    conditions.push(inList(sql`i.status`, input.status));
  if (input.severity?.length) {
    conditions.push(inList(sql`i.severity`, input.severity));
  }
  if (input.service?.length) {
    conditions.push(sql`(
      ${inList(sql`i.service_id`, input.service)}
      or exists (
        select 1 from incident_affected_service affected
        where affected.workspace_id = ${workspaceId}
          and affected.incident_id = i.id
          and ${inList(sql`affected.service_id`, input.service)}
      )
    )`);
  }
  return sql.join(conditions, sql.raw(" and "));
}

async function resolvePeriod(
  from: string,
  to: string,
  timezone: string,
): Promise<Period> {
  const result = await db.execute<{
    start_at: Date | string;
    end_at: Date | string;
  }>(sql`
    select
      (${from}::date::timestamp at time zone ${timezone}) as start_at,
      ((${to}::date + 1)::timestamp at time zone ${timezone}) as end_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Failed to resolve reliability period");
  return {
    from,
    to,
    startAt: new Date(row.start_at),
    endAt: new Date(row.end_at),
  };
}

async function aggregatePeriod(
  workspaceId: string,
  input: ResolvedReliabilityAnalyticsQuery,
  period: Period,
  generatedAt: Date,
) {
  const staleReference = new Date(
    Math.min(generatedAt.valueOf(), period.endAt.valueOf()),
  );
  const result = await db.execute<AggregateRow>(sql`
    -- Equality on the existing (workspace, type, incident, occurred_at) index
    -- keeps both rollups ordered; a combined IN/hash aggregate spills at 100k.
    with resolutions as (
      select
        incident_id,
        min(occurred_at) as first_resolved_at
      from incident_event
      where workspace_id = ${workspaceId}
        and type = 'incident.resolved'
      group by incident_id
    ), reopened as (
      select distinct incident_id
      from incident_event
      where workspace_id = ${workspaceId} and type = 'incident.reopened'
    ), filtered as (
      select
        i.*,
        coalesce(events.first_resolved_at, i.resolved_at) as effective_resolved_at,
        (reopened.incident_id is not null) as reopened
      from incident i
      left join resolutions events on events.incident_id = i.id
      left join reopened on reopened.incident_id = i.id
      where ${filterSql(workspaceId, input, period)}
    )
    select
      count(*)::int as volume,
      count(*) filter (where acknowledged_at >= detected_at)::int as mtta_sample_size,
      avg(extract(epoch from (acknowledged_at - detected_at))::double precision * 1000)
        filter (where acknowledged_at >= detected_at) as mtta_average_ms,
      percentile_cont(0.5) within group (
        order by extract(epoch from (acknowledged_at - detected_at))::double precision * 1000
      ) filter (where acknowledged_at >= detected_at) as mtta_p50_ms,
      percentile_cont(0.9) within group (
        order by extract(epoch from (acknowledged_at - detected_at))::double precision * 1000
      ) filter (where acknowledged_at >= detected_at) as mtta_p90_ms,
      count(*) filter (where effective_resolved_at >= detected_at)::int as mttr_sample_size,
      avg(extract(epoch from (effective_resolved_at - detected_at))::double precision * 1000)
        filter (where effective_resolved_at >= detected_at) as mttr_average_ms,
      percentile_cont(0.5) within group (
        order by extract(epoch from (effective_resolved_at - detected_at))::double precision * 1000
      ) filter (where effective_resolved_at >= detected_at) as mttr_p50_ms,
      percentile_cont(0.9) within group (
        order by extract(epoch from (effective_resolved_at - detected_at))::double precision * 1000
      ) filter (where effective_resolved_at >= detected_at) as mttr_p90_ms,
      count(*) filter (where mitigated_at >= detected_at)::int as mitigation_sample_size,
      avg(extract(epoch from (mitigated_at - detected_at))::double precision * 1000)
        filter (where mitigated_at >= detected_at) as mitigation_average_ms,
      percentile_cont(0.5) within group (
        order by extract(epoch from (mitigated_at - detected_at))::double precision * 1000
      ) filter (where mitigated_at >= detected_at) as mitigation_p50_ms,
      percentile_cont(0.9) within group (
        order by extract(epoch from (mitigated_at - detected_at))::double precision * 1000
      ) filter (where mitigated_at >= detected_at) as mitigation_p90_ms,
      count(*) filter (where reopened)::int as reopened_count,
      count(*) filter (where effective_resolved_at is not null)::int as resolved_base_count,
      count(*) filter (
        where status in ('detected', 'triaging', 'mitigating', 'monitoring')
          and last_update_at < ${staleReference}::timestamptz - (${RELIABILITY_STALE_THRESHOLD_HOURS} * interval '1 hour')
      )::int as stale_count,
      count(*) filter (
        where status in ('detected', 'triaging', 'mitigating', 'monitoring')
      )::int as active_count
    from filtered
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Failed to aggregate reliability metrics");
  return summarizeReliabilityAggregate(row);
}

async function seriesForPeriod(
  workspaceId: string,
  input: ResolvedReliabilityAnalyticsQuery,
  period: Period,
) {
  const result = await db.execute<{
    bucket: string;
    volume: number | string;
  }>(sql`
    select
      to_char(date_trunc('day', i.detected_at at time zone ${input.timezone}), 'YYYY-MM-DD') as bucket,
      count(*)::int as volume
    from incident i
    where ${filterSql(workspaceId, input, period)}
    group by 1
    order by 1
  `);
  return result.rows.map((row) => ({
    bucket: row.bucket,
    volume: integer(row.volume),
  }));
}

async function hotspotsForPeriod(
  workspaceId: string,
  input: ResolvedReliabilityAnalyticsQuery,
  period: Period,
) {
  const result = await db.execute<{
    service_id: string;
    service_name: string;
    incident_count: number | string;
    sev1_count: number | string;
    mttr_p50_ms: number | string | null;
  }>(sql`
    with event_rollup as (
      select incident_id,
        min(occurred_at) filter (where type = 'incident.resolved') as first_resolved_at
      from incident_event
      where workspace_id = ${workspaceId}
        and type = 'incident.resolved'
      group by incident_id
    )
    select
      service.id as service_id,
      service.name as service_name,
      count(*)::int as incident_count,
      count(*) filter (where i.severity = 'sev1')::int as sev1_count,
      percentile_cont(0.5) within group (
        order by extract(epoch from (coalesce(events.first_resolved_at, i.resolved_at) - i.detected_at))::double precision * 1000
      ) filter (
        where coalesce(events.first_resolved_at, i.resolved_at) >= i.detected_at
      ) as mttr_p50_ms
    from incident i
    inner join service
      on service.workspace_id = i.workspace_id and service.id = i.service_id
    left join event_rollup events on events.incident_id = i.id
    where ${filterSql(workspaceId, input, period)}
    group by service.id, service.name
    order by incident_count desc, service.name asc, service.id asc
    limit 20
  `);
  return result.rows.map((row) => ({
    serviceId: row.service_id,
    serviceName: row.service_name,
    incidentCount: integer(row.incident_count),
    sev1Count: integer(row.sev1_count),
    mttrP50Ms: number(row.mttr_p50_ms),
  }));
}

export async function getReliabilityAnalytics(
  workspaceId: string,
  query: ReliabilityAnalyticsQuery,
  now = new Date(),
) {
  const input = resolveReliabilityAnalyticsQuery(query, now);
  const period = await resolvePeriod(input.from, input.to, input.timezone);
  const previous = previousReliabilityPeriod(input.from, input.to);
  const comparisonPeriod = input.compare
    ? await resolvePeriod(previous.from, previous.to, input.timezone)
    : null;
  const [metrics, comparisonMetrics, series, hotspots] = await Promise.all([
    aggregatePeriod(workspaceId, input, period, now),
    comparisonPeriod
      ? aggregatePeriod(workspaceId, input, comparisonPeriod, now)
      : Promise.resolve(null),
    seriesForPeriod(workspaceId, input, period),
    hotspotsForPeriod(workspaceId, input, period),
  ]);
  return {
    definition: {
      version: RELIABILITY_DEFINITION_VERSION,
      timezone: input.timezone,
      staleThresholdHours: RELIABILITY_STALE_THRESHOLD_HOURS,
      hotspotAggregation: "primary_service" as const,
      formulas: RELIABILITY_FORMULAS,
    },
    generatedAt: now,
    filters: input,
    period,
    metrics,
    comparison:
      comparisonPeriod && comparisonMetrics
        ? { period: comparisonPeriod, metrics: comparisonMetrics }
        : null,
    series,
    hotspots,
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvTimestamp(value: Date | string | null) {
  if (value === null) return "";
  return new Date(value).toISOString();
}

export async function exportReliabilityAnalytics(
  workspaceId: string,
  query: ReliabilityAnalyticsQuery,
  now = new Date(),
) {
  const input = resolveReliabilityAnalyticsQuery(query, now);
  const period = await resolvePeriod(input.from, input.to, input.timezone);
  const result = await db.execute<{
    id: string;
    number: number | string;
    title: string;
    status: string;
    severity: string;
    service_id: string;
    service_name: string;
    detected_at: Date | string;
    acknowledged_at: Date | string | null;
    mitigated_at: Date | string | null;
    resolved_at: Date | string | null;
    last_update_at: Date | string;
    reopened: boolean;
  }>(sql`
    select
      i.id, i.number, i.title, i.status, i.severity,
      i.service_id, service.name as service_name,
      i.detected_at, i.acknowledged_at, i.mitigated_at,
      coalesce(events.first_resolved_at, i.resolved_at) as resolved_at,
      i.last_update_at,
      coalesce(events.reopened, false) as reopened
    from incident i
    inner join service
      on service.workspace_id = i.workspace_id and service.id = i.service_id
    left join lateral (
      select
        min(occurred_at) filter (where type = 'incident.resolved') as first_resolved_at,
        bool_or(type = 'incident.reopened') as reopened
      from incident_event
      where workspace_id = ${workspaceId} and incident_id = i.id
    ) events on true
    where ${filterSql(workspaceId, input, period)}
    order by i.detected_at desc, i.id asc
    limit 10000
  `);
  const filterSpec = JSON.stringify(input);
  const columns = [
    "definition_version",
    "generated_at",
    "timezone",
    "filter_spec",
    "incident_id",
    "incident_key",
    "title",
    "status",
    "severity",
    "service_id",
    "service_name",
    "detected_at",
    "acknowledged_at",
    "mitigated_at",
    "resolved_at",
    "last_update_at",
    "reopened",
  ];
  const rows = result.rows.map((row) => [
    RELIABILITY_DEFINITION_VERSION,
    now.toISOString(),
    input.timezone,
    filterSpec,
    row.id,
    `INC-${row.number}`,
    row.title,
    row.status,
    row.severity,
    row.service_id,
    row.service_name,
    csvTimestamp(row.detected_at),
    csvTimestamp(row.acknowledged_at),
    csvTimestamp(row.mitigated_at),
    csvTimestamp(row.resolved_at),
    csvTimestamp(row.last_update_at),
    row.reopened,
  ]);
  return {
    csv: [columns, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n"),
    filename: `relayops-reliability-${input.from}-${input.to}.csv`,
  };
}
