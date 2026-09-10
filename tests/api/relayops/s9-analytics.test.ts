import { describe, expect, it } from "vitest";
import {
  RELIABILITY_FORMULAS,
  summarizeReliabilityAggregate,
} from "../../../apps/api/src/relayops/analytics-controllers";
import {
  isValidAnalyticsTimeZone,
  previousReliabilityPeriod,
  reliabilityAnalyticsQuery,
  resolveReliabilityAnalyticsQuery,
} from "../../../apps/api/src/relayops/analytics-schema";

describe("RelayOps S9 reliability definitions", () => {
  it("normalizes a deterministic canonical filter contract", () => {
    const parsed = reliabilityAnalyticsQuery.parse({
      from: "2026-03-01",
      to: "2026-03-31",
      timezone: "America/New_York",
      status: "resolved,detected,resolved",
      severity: "sev2,sev1",
      service: "svc-b,svc-a,svc-b",
      compare: "false",
    });
    expect(resolveReliabilityAnalyticsQuery(parsed)).toMatchObject({
      from: "2026-03-01",
      to: "2026-03-31",
      timezone: "America/New_York",
      status: ["detected", "resolved"],
      severity: ["sev1", "sev2"],
      service: ["svc-a", "svc-b"],
      compare: false,
      includeDemo: false,
    });
    expect(previousReliabilityPeriod("2026-03-01", "2026-03-31")).toEqual({
      from: "2026-01-29",
      to: "2026-02-28",
    });
  });

  it("accepts DST zones, rejects unknown zones, and keeps calendar periods", () => {
    expect(isValidAnalyticsTimeZone("America/New_York")).toBe(true);
    expect(isValidAnalyticsTimeZone("Europe/Moscow")).toBe(true);
    expect(isValidAnalyticsTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(
      reliabilityAnalyticsQuery.safeParse({ timezone: "Mars/Olympus_Mons" })
        .success,
    ).toBe(false);
  });

  it("reports missing samples and deterministic reopen/stale rates", () => {
    const metrics = summarizeReliabilityAggregate({
      volume: "5",
      mtta_sample_size: "4",
      mtta_average_ms: "1000",
      mtta_p50_ms: "900",
      mtta_p90_ms: "1800",
      mttr_sample_size: "3",
      mttr_average_ms: "5000",
      mttr_p50_ms: "4800",
      mttr_p90_ms: "9000",
      mitigation_sample_size: "2",
      mitigation_average_ms: "2500",
      mitigation_p50_ms: "2500",
      mitigation_p90_ms: "2900",
      reopened_count: "1",
      resolved_base_count: "4",
      stale_count: "2",
      active_count: "4",
    });
    expect(metrics.mtta).toMatchObject({ sampleSize: 4, excludedMissing: 1 });
    expect(metrics.mttr).toMatchObject({ sampleSize: 3, excludedMissing: 2 });
    expect(metrics.mitigation).toMatchObject({
      sampleSize: 2,
      excludedMissing: 3,
    });
    expect(metrics.reopen.percent).toBe(25);
    expect(metrics.stale.percent).toBe(50);
    expect(RELIABILITY_FORMULAS.mttr).toContain("first durable resolution");
  });
});
