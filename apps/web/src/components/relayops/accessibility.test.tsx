import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResponseBoardLabels } from "./response-board";
import { ResponseBoard } from "./response-board";
import type { SignalPanelLabels } from "./signals";
import { SignalPanel } from "./signals";

afterEach(cleanup);

const boardLabels: ResponseBoardLabels = {
  title: "Response Board",
  description: "Canonical incident lifecycle",
  count: (count) => `${count} incidents`,
  statusById: {
    detected: "Detected",
    triaging: "Triaging",
    mitigating: "Mitigating",
    monitoring: "Monitoring",
    resolved: "Resolved",
    dismissed: "Dismissed",
  },
  severityById: {
    unknown: "Unknown",
    sev1: "SEV1",
    sev2: "SEV2",
    sev3: "SEV3",
    sev4: "SEV4",
  },
  dragHandle: (title) => `Drag ${title}`,
  moveTo: (title) => `Move ${title}`,
  openIncident: (title) => `Open ${title}`,
  pending: "Applying transition",
  emptyLane: "No incidents",
  invalidTarget: "Invalid",
  invalidTargetDescription: (title, target) =>
    `${title} cannot move to ${target}`,
  dndDisabled: "Drag and drop disabled; use Move menu",
  reducedMotionFallback: "Reduced motion enabled; use Move menu",
  screenReaderInstructions:
    "Press Space to lift, arrows to move, Space to drop",
  lift: (title, source) => `Lifted ${title} from ${source}`,
  target: (title, target) => `${title} targets ${target}`,
  invalid: (title, target) => `${target} is invalid for ${title}`,
  dropPending: (title, target) => `Dropped ${title} on ${target}; validating`,
  cancelled: (title) => `Cancelled ${title}`,
  accepted: (title, target) => `${title} accepted in ${target}`,
  rollback: (title, source) => `Rolled ${title} back to ${source}`,
  failedTitle: "Transition failed",
  conflictTitle: "Incident changed",
  conflictDescription: (title, version) =>
    `${title} is now at version ${version}`,
  yourMove: "Your move",
  currentState: "Current state",
  compare: "Compare",
  reapply: "Reapply",
  discard: "Discard",
  undo: "Undo",
  undoDescription: (title, from, to) => `${title} moved from ${from} to ${to}`,
};

const signalLabels: SignalPanelLabels = {
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

async function expectNoAxeViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    // JSDOM has no layout engine; contrast is verified in the real browser pass.
    rules: { "color-contrast": { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe("RelayOps automated accessibility", () => {
  it("has no detectable Response Board violations", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = render(
      <ResponseBoard
        incidents={[
          {
            id: "incident-1",
            key: "INC-1",
            title: "Checkout latency",
            summary: "Elevated p95 latency",
            status: "detected",
            severity: "sev2",
            version: 1,
            service: { id: "service-1", name: "Checkout", slug: "checkout" },
          },
        ]}
        labels={boardLabels}
        onTransition={vi.fn()}
      />,
    );
    await expectNoAxeViolations(container);
  });

  it("has no detectable signal intake and queue violations", async () => {
    const { container } = render(
      <SignalPanel
        labels={signalLabels}
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
        services={[{ id: "service-1", name: "Checkout" }]}
        incidentVersion={1}
        canCreate
        canAttach
        formatObservedAt={(value) => value}
        onCreateManual={vi.fn()}
        onCreateDemo={vi.fn()}
        onAttach={vi.fn()}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
