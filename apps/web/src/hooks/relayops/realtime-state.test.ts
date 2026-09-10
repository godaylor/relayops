import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRelayOpsRealtimeState,
  expireRelayOpsPresence,
  markRelayOpsIncidentAuthoritative,
  reduceRelayOpsRealtimeMessage,
} from "./realtime-state";
import {
  ingestRelayOpsRealtimeMessage,
  markRelayOpsAuthoritativeSync,
  registerRelayOpsRealtimeTransport,
  resetRelayOpsRealtimeStoreForTests,
  retryRelayOpsRealtime,
  sendRelayOpsRealtime,
  setRelayOpsConnectionSnapshot,
  useRelayOpsRealtimeState,
} from "./realtime-store";

const invalidation = {
  v: 1,
  type: "RELAYOPS_INCIDENT_INVALIDATED",
  eventId: "event-1",
  eventType: "incident.status_changed",
  workspaceId: "workspace-1",
  incidentId: "incident-1",
  version: 2,
} as const;

describe("RelayOps S6 realtime reducer", () => {
  it("ignores duplicates, out-of-order messages and foreign workspaces", () => {
    const initial = createRelayOpsRealtimeState();
    const first = reduceRelayOpsRealtimeMessage(
      initial,
      invalidation,
      "workspace-1",
    );
    expect(first.effect).toEqual({
      type: "invalidate",
      incidentId: "incident-1",
    });
    expect(first.state.versions["incident-1"]).toBe(2);

    const duplicate = reduceRelayOpsRealtimeMessage(
      first.state,
      invalidation,
      "workspace-1",
    );
    expect(duplicate.effect).toEqual({ type: "ignore" });
    expect(duplicate.state).toBe(first.state);

    const older = reduceRelayOpsRealtimeMessage(
      first.state,
      { ...invalidation, eventId: "event-old", version: 1 },
      "workspace-1",
    );
    expect(older.effect).toEqual({ type: "ignore" });

    const foreign = reduceRelayOpsRealtimeMessage(
      first.state,
      { ...invalidation, eventId: "event-foreign", workspaceId: "workspace-2" },
      "workspace-1",
    );
    expect(foreign.effect).toEqual({ type: "ignore" });
  });

  it("detects a version gap and clears it only after authoritative state", () => {
    const first = reduceRelayOpsRealtimeMessage(
      createRelayOpsRealtimeState(),
      invalidation,
      "workspace-1",
    );
    const gap = reduceRelayOpsRealtimeMessage(
      first.state,
      { ...invalidation, eventId: "event-2", version: 5 },
      "workspace-1",
    );
    expect(gap.effect).toEqual({
      type: "authoritative-refetch",
      incidentId: "incident-1",
    });
    expect(gap.state.gapIncidentIds).toEqual(["incident-1"]);

    const authoritative = markRelayOpsIncidentAuthoritative(
      gap.state,
      "incident-1",
      6,
    );
    expect(authoritative.versions["incident-1"]).toBe(6);
    expect(authoritative.gapIncidentIds).toEqual([]);
  });

  it("applies heartbeat/leave and expires presence using injected time", () => {
    const now = Date.parse("2026-08-28T10:00:00.000Z");
    const heartbeat = {
      v: 1,
      type: "RELAYOPS_PRESENCE",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
      action: "heartbeat",
      participant: {
        connectionId: "connection-1",
        userId: "user-1",
        displayName: "Ada",
        expiresAt: new Date(now + 1_000).toISOString(),
      },
    } as const;
    const joined = reduceRelayOpsRealtimeMessage(
      createRelayOpsRealtimeState(),
      heartbeat,
      "workspace-1",
      now,
    );
    expect(joined.effect).toEqual({
      type: "presence",
      incidentId: "incident-1",
    });
    expect(joined.state.presence["incident-1"]?.["connection-1"]?.userId).toBe(
      "user-1",
    );

    const left = reduceRelayOpsRealtimeMessage(
      joined.state,
      { ...heartbeat, action: "leave" },
      "workspace-1",
      now,
    );
    expect(left.state.presence).toEqual({});

    expect(expireRelayOpsPresence(joined.state, now + 1_001).presence).toEqual(
      {},
    );
  });
});

describe("RelayOps S6 realtime store", () => {
  beforeEach(() => resetRelayOpsRealtimeStoreForTests());

  it("publishes connection, stale and authoritative sync state", () => {
    const { result } = renderHook(() =>
      useRelayOpsRealtimeState("workspace-1"),
    );
    expect(result.current.connection).toBe("connecting");
    expect(result.current.stale).toBe(true);

    act(() => {
      setRelayOpsConnectionSnapshot("workspace-1", {
        connection: "reconnecting",
        reconnectAt: 5_000,
        reconnectAttempt: 2,
      });
    });
    expect(result.current).toMatchObject({
      connection: "reconnecting",
      reconnectAt: 5_000,
      reconnectAttempt: 2,
      stale: true,
    });

    act(() => {
      markRelayOpsAuthoritativeSync(
        "workspace-1",
        new Date("2026-08-28T10:01:00.000Z"),
      );
    });
    expect(result.current.stale).toBe(false);
    expect(result.current.lastSyncAt).toBe("2026-08-28T10:01:00.000Z");
  });

  it("exposes bounded transport retry/send and marks gaps stale", () => {
    const retry = vi.fn();
    const send = vi.fn(() => true);
    const unregister = registerRelayOpsRealtimeTransport("workspace-1", {
      retry,
      send,
    });
    const { result } = renderHook(() =>
      useRelayOpsRealtimeState("workspace-1"),
    );

    expect(sendRelayOpsRealtime("workspace-1", { type: "ping" })).toBe(true);
    retryRelayOpsRealtime("workspace-1");
    expect(send).toHaveBeenCalledWith({ type: "ping" });
    expect(retry).toHaveBeenCalledTimes(1);

    act(() => {
      ingestRelayOpsRealtimeMessage("workspace-1", invalidation);
      ingestRelayOpsRealtimeMessage("workspace-1", {
        ...invalidation,
        eventId: "event-gap",
        version: 5,
      });
    });
    expect(result.current.stale).toBe(true);
    expect(result.current.data.gapIncidentIds).toEqual(["incident-1"]);

    unregister();
    expect(sendRelayOpsRealtime("workspace-1", { type: "ping" })).toBe(false);
  });
});
