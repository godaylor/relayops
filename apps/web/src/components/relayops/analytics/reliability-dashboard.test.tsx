// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RelayOpsReliabilityAnalytics } from "@/fetchers/relayops-analytics";
import type { ReliabilityAnalyticsSearch } from "@/lib/relayops-analytics-search";
import { ReliabilityDashboard } from "./reliability-dashboard";

afterEach(cleanup);

const search: ReliabilityAnalyticsSearch = {
  from: "2026-03-01",
  to: "2026-03-31",
  timezone: "UTC",
  status: [],
  severity: [],
  service: [],
  compare: true,
  includeDemo: false,
};

const durationMetric = {
  sampleSize: 2,
  excludedMissing: 1,
  averageMs: 60_000,
  p50Ms: 60_000,
  p90Ms: 120_000,
};

const metrics = {
  volume: { count: 3 },
  mtta: durationMetric,
  mttr: durationMetric,
  mitigation: durationMetric,
  reopen: { numerator: 1, denominator: 2, percent: 50 },
  stale: { numerator: 1, denominator: 2, percent: 50 },
};

const data = {
  definition: {
    version: "relayops-reliability-v1",
    timezone: "UTC",
    staleThresholdHours: 24,
    hotspotAggregation: "primary_service",
    formulas: {
      mtta: "acknowledged - detected",
      mttr: "resolved - detected",
      mitigation: "mitigated - detected",
      reopen: "reopened / resolved",
      stale: "stale / active",
      volume: "detected count",
    },
  },
  generatedAt: "2026-03-31T12:00:00.000Z",
  filters: search,
  period: {
    from: search.from,
    to: search.to,
    startAt: "2026-03-01T00:00:00.000Z",
    endAt: "2026-04-01T00:00:00.000Z",
  },
  metrics,
  comparison: {
    period: {
      from: "2026-01-29",
      to: "2026-02-28",
      startAt: "2026-01-29T00:00:00.000Z",
      endAt: "2026-03-01T00:00:00.000Z",
    },
    metrics,
  },
  series: [
    { bucket: "2026-03-10", volume: 1 },
    { bucket: "2026-03-11", volume: 2 },
  ],
  hotspots: [
    {
      serviceId: "service-1",
      serviceName: "Checkout",
      incidentCount: 2,
      sev1Count: 1,
      mttrP50Ms: 60_000,
    },
  ],
} as const satisfies RelayOpsReliabilityAnalytics;

describe("ReliabilityDashboard", () => {
  it("keeps filters, chart drilldown and table alternative keyboard-accessible", () => {
    const onSearchChange = vi.fn();
    const onDrilldown = vi.fn();
    render(
      <ReliabilityDashboard
        data={data}
        search={search}
        services={[{ id: "service-1", name: "Checkout" }]}
        canExport
        onSearchChange={onSearchChange}
        onDrilldown={onDrilldown}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    const bucketButtons = screen.getAllByRole("button", {
      name: "relayops:analytics.openBucket",
    });
    expect(bucketButtons).toHaveLength(2);
    fireEvent.click(bucketButtons[0] as HTMLButtonElement);
    expect(onDrilldown).toHaveBeenCalledWith("2026-03-10");
    fireEvent.change(screen.getByLabelText("relayops:analytics.service"), {
      target: { value: "service-1" },
    });
    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ service: ["service-1"] }),
    );
  });

  it("has no automated axe violations and hides unauthorized export", async () => {
    const { container } = render(
      <ReliabilityDashboard
        data={data}
        search={search}
        services={[]}
        canExport={false}
        onSearchChange={vi.fn()}
        onDrilldown={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /relayops:analytics.export/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("acknowledged - detected")).toBeInTheDocument();
    const result = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
});
