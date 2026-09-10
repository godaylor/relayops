import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseBoard } from "./response-board";
import type {
  ResponseBoardIncident,
  ResponseBoardLabels,
  ResponseBoardTransitionCommand,
} from "./types";

const labels: ResponseBoardLabels = {
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

function incident(
  status: ResponseBoardIncident["status"] = "detected",
  version = 1,
): ResponseBoardIncident {
  return {
    id: "incident-1",
    key: "INC-1",
    title: "Checkout latency",
    summary: "Elevated checkout latency",
    status,
    severity: "sev2",
    version,
    service: { id: "service-1", name: "Checkout", slug: "checkout" },
  };
}

function matchMedia(matches: boolean) {
  return vi.fn().mockReturnValue({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

async function openMoveMenu() {
  fireEvent.click(
    screen.getByRole("button", { name: "Move Checkout latency" }),
  );
  await screen.findByRole("menu");
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", matchMedia(false));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResponseBoard", () => {
  it("routes each menu action through exactly one versioned command and preserves the keyboard lifecycle order", async () => {
    const onTransition = vi.fn(
      async (command: ResponseBoardTransitionCommand) => ({
        incident: {
          status: command.to,
          version: command.expectedVersion + 1,
        },
      }),
    );
    const keys = ["transition-key-1", "transition-key-2"];
    render(
      <ResponseBoard
        createIdempotencyKey={() => keys.shift() ?? "unexpected-key"}
        incidents={[incident()]}
        labels={labels}
        onTransition={onTransition}
      />,
    );

    await openMoveMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Triaging" }));
    await waitFor(() => expect(onTransition).toHaveBeenCalledTimes(1));
    expect(onTransition).toHaveBeenLastCalledWith({
      incidentId: "incident-1",
      to: "triaging",
      expectedVersion: 1,
      idempotencyKey: "transition-key-1",
      origin: "menu",
    });

    await openMoveMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Mitigating" }));
    await waitFor(() => expect(onTransition).toHaveBeenCalledTimes(2));
    expect(onTransition).toHaveBeenLastCalledWith({
      incidentId: "incident-1",
      to: "mitigating",
      expectedVersion: 2,
      idempotencyKey: "transition-key-2",
      origin: "menu",
    });
    expect(
      within(screen.getByRole("region", { name: "Mitigating" })).getByText(
        "Checkout latency",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("marks invalid targets with text and an icon-backed disabled menu item", async () => {
    const onTransition = vi.fn();
    render(
      <ResponseBoard
        dndEnabled={false}
        incidents={[incident()]}
        labels={labels}
        onTransition={onTransition}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Drag Checkout latency" }),
    ).toBeNull();
    expect(
      screen.getByText("Drag and drop disabled; use Move menu"),
    ).toBeInTheDocument();
    await openMoveMenu();
    const invalid = screen.getByRole("menuitem", {
      name: "Resolved — Invalid",
    });
    expect(invalid).toHaveAttribute("data-disabled");
    fireEvent.click(invalid);
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("shows an optimistic preview, then rolls back without a success state", async () => {
    let rejectTransition: (error: Error) => void = () => undefined;
    const onTransition = vi.fn(
      () =>
        new Promise<undefined>((_resolve, reject) => {
          rejectTransition = reject;
        }),
    );
    render(
      <ResponseBoard
        createIdempotencyKey={() => "rollback-key"}
        incidents={[incident()]}
        labels={labels}
        onTransition={onTransition}
      />,
    );

    await openMoveMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Triaging" }));
    expect(
      within(screen.getByRole("region", { name: "Triaging" })).getByText(
        "Checkout latency",
      ),
    ).toBeInTheDocument();
    expect(onTransition).toHaveBeenCalledTimes(1);

    rejectTransition(new Error("Network unavailable"));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Detected" })).getByText(
        "Checkout latency",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rolled Checkout latency back to Detected"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Checkout latency accepted in Triaging"),
    ).toBeNull();
  });

  it("preserves stale context and reapplies the same idempotency key at the authoritative version", async () => {
    const conflict = Object.assign(new Error("Stale incident"), {
      body: {
        code: "version_conflict",
        current: { incident: { status: "triaging", version: 3 } },
      },
    });
    const onCompareConflict = vi.fn();
    const onTransition = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({
        incident: { status: "mitigating", version: 4 },
      });
    render(
      <ResponseBoard
        createIdempotencyKey={() => "stable-conflict-key"}
        incidents={[incident("triaging", 2)]}
        labels={labels}
        onCompareConflict={onCompareConflict}
        onTransition={onTransition}
      />,
    );

    await openMoveMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Mitigating" }));
    expect(await screen.findByText("Incident changed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(onCompareConflict).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Triaging → Mitigating")).toBeInTheDocument();
    expect(screen.getByText("Triaging · v3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reapply" }));
    await waitFor(() => expect(onTransition).toHaveBeenCalledTimes(2));
    expect(onTransition.mock.calls[1]?.[0]).toEqual({
      incidentId: "incident-1",
      to: "mitigating",
      expectedVersion: 3,
      idempotencyKey: "stable-conflict-key",
      origin: "reapply",
    });
  });

  it("offers undo only for a reversible transition and sends undo through the same command", async () => {
    const onTransition = vi.fn(
      async (command: ResponseBoardTransitionCommand) => ({
        incident: {
          status: command.to,
          version: command.expectedVersion + 1,
        },
      }),
    );
    render(
      <ResponseBoard
        createIdempotencyKey={() => "undo-key"}
        incidents={[incident("mitigating", 4)]}
        labels={labels}
        onTransition={onTransition}
      />,
    );

    await openMoveMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Monitoring" }));
    const undo = await screen.findByRole("button", { name: "Undo" });
    fireEvent.click(undo);
    await waitFor(() => expect(onTransition).toHaveBeenCalledTimes(2));
    expect(onTransition.mock.calls[1]?.[0]).toMatchObject({
      to: "mitigating",
      expectedVersion: 5,
      origin: "undo",
    });
  });

  it("removes spatial DnD under reduced motion while retaining the menu fallback", async () => {
    vi.stubGlobal("matchMedia", matchMedia(true));
    render(
      <ResponseBoard
        incidents={[incident()]}
        labels={labels}
        onTransition={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Reduced motion enabled; use Move menu"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Drag Checkout latency" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Move Checkout latency" }),
    ).toBeInTheDocument();
  });
});
