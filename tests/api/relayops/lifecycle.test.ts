import { describe, expect, it } from "vitest";
import {
  allowedIncidentTransitions,
  deriveIncidentTransitionTimestamps,
  type IncidentStatus,
  incidentStatuses,
  incidentTransitionEventType,
  isAllowedIncidentTransition,
  validateIncidentTimestamps,
} from "../../../apps/api/src/relayops/lifecycle";

const allowed = new Set(
  Object.entries(allowedIncidentTransitions).flatMap(([from, targets]) =>
    targets.map((to) => from + "->" + to),
  ),
);

describe("RelayOps incident lifecycle", () => {
  it("matches the authoritative transition table exhaustively", () => {
    const expected = new Set([
      "detected->triaging",
      "detected->dismissed",
      "triaging->mitigating",
      "triaging->monitoring",
      "triaging->resolved",
      "triaging->dismissed",
      "mitigating->monitoring",
      "mitigating->resolved",
      "monitoring->mitigating",
      "monitoring->resolved",
      "resolved->monitoring",
      "dismissed->triaging",
    ]);
    expect(allowed).toEqual(expected);

    for (const from of incidentStatuses) {
      for (const to of incidentStatuses) {
        expect(isAllowedIncidentTransition(from, to)).toBe(
          expected.has(from + "->" + to),
        );
      }
    }
  });

  it("rejects every forbidden transition without deriving timestamps", () => {
    const now = new Date("2026-08-28T10:00:00.000Z");
    for (const from of incidentStatuses) {
      for (const to of incidentStatuses) {
        if (allowed.has(from + "->" + to)) continue;
        expect(() =>
          deriveIncidentTransitionTimestamps(
            from,
            to,
            {
              detectedAt: new Date("2026-08-28T09:00:00.000Z"),
              acknowledgedAt: null,
              mitigatedAt: null,
              resolvedAt: null,
              dismissedAt: null,
            },
            now,
          ),
        ).toThrow();
      }
    }
  });

  it("derives acknowledgement, mitigation, resolution and reopen timestamps", () => {
    const detectedAt = new Date("2026-08-28T09:00:00.000Z");
    const triagedAt = new Date("2026-08-28T09:02:00.000Z");
    const monitoredAt = new Date("2026-08-28T09:12:00.000Z");
    const resolvedAt = new Date("2026-08-28T09:20:00.000Z");
    const reopenedAt = new Date("2026-08-28T09:25:00.000Z");

    const triaging = deriveIncidentTransitionTimestamps(
      "detected",
      "triaging",
      {
        detectedAt,
        acknowledgedAt: null,
        mitigatedAt: null,
        resolvedAt: null,
        dismissedAt: null,
      },
      triagedAt,
    );
    expect(triaging.acknowledgedAt).toEqual(triagedAt);

    const monitoring = deriveIncidentTransitionTimestamps(
      "triaging",
      "monitoring",
      triaging,
      monitoredAt,
    );
    expect(monitoring.mitigatedAt).toEqual(monitoredAt);

    const resolved = deriveIncidentTransitionTimestamps(
      "monitoring",
      "resolved",
      monitoring,
      resolvedAt,
    );
    expect(resolved.resolvedAt).toEqual(resolvedAt);
    expect(validateIncidentTimestamps("resolved", resolved)).toBe(true);

    const reopened = deriveIncidentTransitionTimestamps(
      "resolved",
      "monitoring",
      resolved,
      reopenedAt,
    );
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.mitigatedAt).toEqual(monitoredAt);
    expect(validateIncidentTimestamps("monitoring", reopened)).toBe(true);
  });

  it("clears mitigation when monitoring regresses to mitigating", () => {
    const next = deriveIncidentTransitionTimestamps(
      "monitoring",
      "mitigating",
      {
        detectedAt: new Date("2026-08-28T09:00:00.000Z"),
        acknowledgedAt: new Date("2026-08-28T09:02:00.000Z"),
        mitigatedAt: new Date("2026-08-28T09:12:00.000Z"),
        resolvedAt: null,
        dismissedAt: null,
      },
      new Date("2026-08-28T09:15:00.000Z"),
    );
    expect(next.mitigatedAt).toBeNull();
    expect(validateIncidentTimestamps("mitigating", next)).toBe(true);
  });

  it.each([
    ["triaging", "resolved", "incident.resolved"],
    ["detected", "dismissed", "incident.dismissed"],
    ["resolved", "monitoring", "incident.reopened"],
    ["dismissed", "triaging", "incident.reopened"],
    ["triaging", "mitigating", "incident.status_changed"],
  ] as const)("maps %s -> %s to %s", (from, to, type) => {
    expect(
      incidentTransitionEventType(from as IncidentStatus, to as IncidentStatus),
    ).toBe(type);
  });

  it("rejects invalid manual timestamp order", () => {
    expect(
      validateIncidentTimestamps("resolved", {
        detectedAt: new Date("2026-08-28T09:00:00.000Z"),
        acknowledgedAt: new Date("2026-08-28T09:05:00.000Z"),
        mitigatedAt: new Date("2026-08-28T09:04:00.000Z"),
        resolvedAt: new Date("2026-08-28T09:20:00.000Z"),
        dismissedAt: null,
      }),
    ).toBe(false);
  });
});
