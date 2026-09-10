import { responseTimestamp, z } from "../openapi";
import { incidentSeverities, incidentStatuses } from "./lifecycle";

const durationMetricSchema = z.object({
  sampleSize: z.number().int().nonnegative(),
  excludedMissing: z.number().int().nonnegative(),
  averageMs: z.number().nonnegative().nullable(),
  p50Ms: z.number().nonnegative().nullable(),
  p90Ms: z.number().nonnegative().nullable(),
});

const rateMetricSchema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100).nullable(),
});

const metricSetSchema = z.object({
  volume: z.object({ count: z.number().int().nonnegative() }),
  mtta: durationMetricSchema,
  mttr: durationMetricSchema,
  mitigation: durationMetricSchema,
  reopen: rateMetricSchema,
  stale: rateMetricSchema,
});

const periodSchema = z.object({
  from: z.string(),
  to: z.string(),
  startAt: responseTimestamp,
  endAt: responseTimestamp,
});

export const reliabilityAnalyticsResponseSchema = z
  .object({
    definition: z.object({
      version: z.literal("relayops-reliability-v1"),
      timezone: z.string(),
      staleThresholdHours: z.literal(24),
      hotspotAggregation: z.literal("primary_service"),
      formulas: z.object({
        mtta: z.string(),
        mttr: z.string(),
        mitigation: z.string(),
        reopen: z.string(),
        stale: z.string(),
        volume: z.string(),
      }),
    }),
    generatedAt: responseTimestamp,
    filters: z.object({
      from: z.string(),
      to: z.string(),
      timezone: z.string(),
      status: z.array(z.enum(incidentStatuses)),
      severity: z.array(z.enum(incidentSeverities)),
      service: z.array(z.string()),
      compare: z.boolean(),
      includeDemo: z.boolean(),
    }),
    period: periodSchema,
    metrics: metricSetSchema,
    comparison: z
      .object({ period: periodSchema, metrics: metricSetSchema })
      .nullable(),
    series: z.array(
      z.object({ bucket: z.string(), volume: z.number().int().nonnegative() }),
    ),
    hotspots: z.array(
      z.object({
        serviceId: z.string(),
        serviceName: z.string(),
        incidentCount: z.number().int().nonnegative(),
        sev1Count: z.number().int().nonnegative(),
        mttrP50Ms: z.number().nonnegative().nullable(),
      }),
    ),
  })
  .openapi("RelayOpsReliabilityAnalytics");
