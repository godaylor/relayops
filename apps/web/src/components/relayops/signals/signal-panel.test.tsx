// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignalPanel } from "./signal-panel";
import type { SignalPanelLabels } from "./types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const labels: SignalPanelLabels = {
  title: "Signals",
  description: "Normalize observations before incident response.",
  intakeEyebrow: "Intake / triage",
  manualHeading: "Add an observation",
  queueHeading: "Signal queue",
  titleField: "Signal title",
  summaryField: "Summary",
  serviceField: "Service",
  noService: "No service",
  severityField: "Severity hint",
  createManual: "Create signal",
  createDemo: "Generate demo signal",
  attach: "Attach to incident",
  attached: "Attached",
  empty: "No signals",
  pending: "Working",
  error: "Signal action failed",
  source: "Source",
  observedAt: "Observed",
  severity: {
    unknown: "Unknown",
    sev1: "SEV1",
    sev2: "SEV2",
    sev3: "SEV3",
    sev4: "SEV4",
  },
};

describe("SignalPanel", () => {
  it("submits manual and demo inputs through accessible controls", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "request-id-123" });
    const onCreateManual = vi.fn().mockResolvedValue(undefined);
    const onCreateDemo = vi.fn().mockResolvedValue(undefined);
    render(
      <SignalPanel
        labels={labels}
        signals={[]}
        services={[{ id: "service-1", name: "Checkout API" }]}
        canCreate
        canAttach
        formatObservedAt={(value) => value}
        onCreateManual={onCreateManual}
        onCreateDemo={onCreateDemo}
        onAttach={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Signal title"), {
      target: { value: "Latency above SLO" },
    });
    fireEvent.change(screen.getByLabelText("Service"), {
      target: { value: "service-1" },
    });
    fireEvent.change(screen.getByLabelText("Severity hint"), {
      target: { value: "sev2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create signal" }));

    await waitFor(() =>
      expect(onCreateManual).toHaveBeenCalledWith({
        idempotencyKey: "request-id-123",
        serviceId: "service-1",
        title: "Latency above SLO",
        summary: undefined,
        severityHint: "sev2",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate demo signal" }),
    );
    expect(onCreateDemo).toHaveBeenCalledOnce();
  });

  it("offers a button alternative for attaching a queued signal", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "attach-request-1" });
    const onAttach = vi.fn().mockResolvedValue(undefined);
    render(
      <SignalPanel
        labels={labels}
        signals={[
          {
            id: "signal-1",
            source: "manual",
            title: "Elevated error rate",
            summary: null,
            observedAt: "2026-08-28T10:00:00.000Z",
            severityHint: "sev2",
            ingestionStatus: "new",
          },
        ]}
        services={[]}
        incidentVersion={7}
        canCreate
        canAttach
        formatObservedAt={() => "28 Aug, 10:00"}
        onCreateManual={vi.fn()}
        onCreateDemo={vi.fn()}
        onAttach={onAttach}
      />,
    );

    expect(screen.getByText("Elevated error rate")).toBeInTheDocument();
    expect(screen.getByText("Observed: 28 Aug, 10:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attach to incident" }));
    await waitFor(() =>
      expect(onAttach).toHaveBeenCalledWith({
        signalId: "signal-1",
        expectedVersion: 7,
        idempotencyKey: "attach-request-1",
      }),
    );
  });

  it("keeps every mutation disabled for a read-only viewer", () => {
    render(
      <SignalPanel
        labels={labels}
        signals={[]}
        services={[]}
        canCreate={false}
        canAttach={false}
        formatObservedAt={(value) => value}
        onCreateManual={vi.fn()}
        onCreateDemo={vi.fn()}
        onAttach={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Create signal" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Generate demo signal" }),
    ).toBeDisabled();
  });
});
