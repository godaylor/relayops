import { describe, expect, it } from "vitest";
import {
  parseReliabilityAnalyticsSearch,
  serializeReliabilityAnalyticsSearch,
} from "./relayops-analytics-search";

describe("RelayOps reliability analytics URL state", () => {
  it("validates, sorts and serializes a canonical shareable filter set", () => {
    const search = parseReliabilityAnalyticsSearch(
      {
        from: "2026-03-01",
        to: "2026-03-31",
        timezone: "America/New_York",
        status: "resolved,detected,resolved",
        severity: "sev2,sev1",
        service: "svc-b,svc-a,svc-b",
        compare: "false",
      },
      new Date("2026-08-28T12:00:00.000Z"),
    );
    expect(search).toMatchObject({
      status: ["detected", "resolved"],
      severity: ["sev1", "sev2"],
      service: ["svc-a", "svc-b"],
      compare: false,
    });
    expect(serializeReliabilityAnalyticsSearch(search)).toContain(
      "timezone=America%2FNew_York",
    );
  });

  it("falls back for invalid ranges and drops unknown filter values", () => {
    const search = parseReliabilityAnalyticsSearch(
      {
        from: "2026-05-20",
        to: "2026-05-01",
        timezone: "Mars/Olympus_Mons",
        status: "destroyed",
        severity: "sev9",
        service: "not/a/service",
      },
      new Date("2026-08-28T12:00:00.000Z"),
    );
    expect(search.from).toBe("2026-07-30");
    expect(search.to).toBe("2026-08-28");
    expect(search.status).toEqual([]);
    expect(search.severity).toEqual([]);
    expect(search.service).toEqual([]);
  });
});
