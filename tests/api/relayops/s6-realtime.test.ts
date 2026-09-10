import { describe, expect, it } from "vitest";
import {
  calculateOutboxRetryDelayMs,
  RELAYOPS_OUTBOX_MAX_ATTEMPTS,
  redactOutboxError,
} from "../../../apps/api/src/relayops/outbox-hardening";
import { RelayOpsPresenceRegistry } from "../../../apps/api/src/relayops/presence";
import {
  createRelayOpsRealtimeEnvelope,
  isRelayOpsRealtimeEnvelope,
} from "../../../apps/api/src/relayops/realtime";

describe("RelayOps S6 realtime envelope", () => {
  it("creates a compact versioned workspace-safe invalidation", () => {
    const envelope = createRelayOpsRealtimeEnvelope({
      eventId: "outbox-1",
      eventType: "incident.status_changed",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
      version: 4,
    });

    expect(envelope).toEqual({
      v: 1,
      type: "RELAYOPS_INCIDENT_INVALIDATED",
      eventId: "outbox-1",
      eventType: "incident.status_changed",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
      version: 4,
    });
    expect(isRelayOpsRealtimeEnvelope(envelope)).toBe(true);
    expect(
      isRelayOpsRealtimeEnvelope({ ...envelope, workspaceId: undefined }),
    ).toBe(false);
    expect(isRelayOpsRealtimeEnvelope({ ...envelope, version: 0 })).toBe(false);
    expect(isRelayOpsRealtimeEnvelope({ ...envelope, v: 2 })).toBe(false);
  });
});

describe("RelayOps S6 outbox hardening helpers", () => {
  it("uses capped exponential full jitter with deterministic injection", () => {
    expect(calculateOutboxRetryDelayMs(1, () => 0.5)).toBe(500);
    expect(calculateOutboxRetryDelayMs(2, () => 0.5)).toBe(1_000);
    expect(calculateOutboxRetryDelayMs(3, () => 0.5)).toBe(2_000);
    expect(calculateOutboxRetryDelayMs(30, () => 0.5)).toBe(150_000);
    expect(calculateOutboxRetryDelayMs(1, () => 0)).toBe(1);
    expect(calculateOutboxRetryDelayMs(1, () => 2)).toBe(1_000);
    expect(RELAYOPS_OUTBOX_MAX_ATTEMPTS).toBe(8);
  });

  it("redacts credentials before an error can be persisted or logged", () => {
    const redacted = redactOutboxError(
      new Error(
        "Bearer top-secret token=abc123 password:open-sesame https://example.test/hook?signature=feedface&key=private",
      ),
    );

    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain("token=[REDACTED]");
    expect(redacted).toContain("password=[REDACTED]");
    expect(redacted).toContain("signature=[REDACTED]");
    expect(redacted).toContain("key=[REDACTED]");
    expect(redacted).not.toMatch(
      /top-secret|abc123|open-sesame|feedface|private/,
    );
  });
});

describe("RelayOps S6 ephemeral presence", () => {
  it("enforces room caps, immutable connection identity, TTL and leave", () => {
    let now = Date.parse("2026-08-28T10:00:00.000Z");
    const registry = new RelayOpsPresenceRegistry({ now: () => now }, 1_000, 2);

    const first = registry.heartbeat({
      connectionId: "connection-1",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
      userId: "user-1",
      displayName: "Ada",
    });
    registry.heartbeat({
      connectionId: "connection-2",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
      userId: "user-2",
      displayName: "Grace",
    });

    expect(first).toMatchObject({
      v: 1,
      type: "RELAYOPS_PRESENCE",
      action: "heartbeat",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
    });
    expect(registry.list("workspace-1", "incident-1")).toHaveLength(2);
    expect(() =>
      registry.heartbeat({
        connectionId: "connection-3",
        workspaceId: "workspace-1",
        incidentId: "incident-1",
        userId: "user-3",
        displayName: "Linus",
      }),
    ).toThrow("capacity");
    expect(() =>
      registry.heartbeat({
        connectionId: "connection-1",
        workspaceId: "workspace-1",
        incidentId: "incident-1",
        userId: "user-other",
        displayName: "Mallory",
      }),
    ).toThrow("identity changed");

    const leave = registry.leave("connection-2");
    expect(leave).toMatchObject({ action: "leave" });
    expect(registry.list("workspace-1", "incident-1")).toHaveLength(1);

    now += 1_001;
    expect(registry.sweep()).toBe(1);
    expect(registry.list("workspace-1", "incident-1")).toEqual([]);
  });

  it("keeps rooms isolated by workspace and incident", () => {
    const registry = new RelayOpsPresenceRegistry(
      { now: () => Date.parse("2026-08-28T10:00:00.000Z") },
      1_000,
      10,
    );
    registry.heartbeat({
      connectionId: "connection-1",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
      userId: "user-1",
      displayName: "Ada",
    });

    expect(registry.list("workspace-2", "incident-1")).toEqual([]);
    expect(registry.list("workspace-1", "incident-2")).toEqual([]);
  });
});
