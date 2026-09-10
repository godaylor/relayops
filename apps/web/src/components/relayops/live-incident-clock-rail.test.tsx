import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveIncidentClockRail } from "./live-incident-clock-rail";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href="/incident" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "relayops:clockRail.title": "Live incident clock rail",
        "relayops:clockRail.loading": "Loading active incidents…",
        "relayops:clockRail.error": "Active incidents unavailable.",
        "relayops:clockRail.retry": "Retry clock rail",
        "relayops:clockRail.empty": "No active incidents",
        "relayops:clockRail.elapsedHoursMinutes": `${values?.hours}h ${values?.minutes}m`,
        "relayops:clockRail.elapsedMinutes": `${values?.minutes}m`,
        "relayops:clockRail.openIncident": `Open ${values?.title}, ${values?.severity}, ${values?.status}, elapsed ${values?.elapsed}`,
        "relayops:status.triaging": "Triaging",
      };
      return labels[key] ?? key;
    },
  }),
}));

afterEach(cleanup);

const incident = {
  id: "incident-1",
  workspaceId: "workspace-1",
  number: 1,
  key: "INC-1",
  createdBy: null,
  serviceId: "service-1",
  title: "Checkout latency",
  summary: null,
  severity: "sev2" as const,
  impact: "degraded" as const,
  status: "triaging" as const,
  commanderId: null,
  resolutionSummary: null,
  detectedAt: "2026-08-28T10:00:00.000Z",
  acknowledgedAt: null,
  mitigatedAt: null,
  resolvedAt: null,
  dismissedAt: null,
  version: 2,
  isDemo: true,
  demoDataSetId: "demo-1",
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
  lastUpdateAt: "2026-08-28T10:00:00.000Z",
};

describe("LiveIncidentClockRail", () => {
  it("exposes severity, lifecycle, elapsed time and a real incident link", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:05:00.000Z"));
    const { container } = render(
      <LiveIncidentClockRail
        workspaceId="workspace-1"
        incidents={[incident]}
      />,
    );
    expect(
      screen.getByRole("complementary", { name: "Live incident clock rail" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /Checkout latency, SEV2, Triaging, elapsed 2h 5m/,
      }),
    ).toBeVisible();
    vi.useRealTimers();
    const result = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("records loading, empty and retryable error states", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <LiveIncidentClockRail
        workspaceId="workspace-1"
        incidents={[]}
        loading
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading active incidents",
    );
    rerender(
      <LiveIncidentClockRail workspaceId="workspace-1" incidents={[]} />,
    );
    expect(screen.getByText("No active incidents")).toBeVisible();
    rerender(
      <LiveIncidentClockRail
        workspaceId="workspace-1"
        incidents={[]}
        error
        onRetry={retry}
      />,
    );
    screen.getByRole("button", { name: "Retry clock rail" }).click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
