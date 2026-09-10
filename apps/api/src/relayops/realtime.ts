import type { RelayOpsOutboxPayload } from "../database/schema";

export type RelayOpsRealtimeEnvelope = {
  v: 1;
  type: "RELAYOPS_INCIDENT_INVALIDATED";
  eventId: string;
  eventType: RelayOpsOutboxPayload["type"];
  workspaceId: string;
  incidentId: string;
  version: number;
};

export type RelayOpsPresenceEnvelope = {
  v: 1;
  type: "RELAYOPS_PRESENCE";
  workspaceId: string;
  incidentId: string;
  action: "heartbeat" | "leave";
  participant: {
    connectionId: string;
    userId: string;
    displayName: string;
    expiresAt: string;
  };
};

export function createRelayOpsRealtimeEnvelope(input: {
  eventId: string;
  eventType: RelayOpsOutboxPayload["type"];
  workspaceId: string;
  incidentId: string;
  version: number;
}): RelayOpsRealtimeEnvelope {
  return {
    v: 1,
    type: "RELAYOPS_INCIDENT_INVALIDATED",
    eventId: input.eventId,
    eventType: input.eventType,
    workspaceId: input.workspaceId,
    incidentId: input.incidentId,
    version: input.version,
  };
}

export function isRelayOpsRealtimeEnvelope(
  value: unknown,
): value is RelayOpsRealtimeEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RelayOpsRealtimeEnvelope>;
  return (
    candidate.v === 1 &&
    candidate.type === "RELAYOPS_INCIDENT_INVALIDATED" &&
    typeof candidate.eventId === "string" &&
    typeof candidate.eventType === "string" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.incidentId === "string" &&
    typeof candidate.version === "number" &&
    Number.isSafeInteger(candidate.version) &&
    candidate.version > 0
  );
}
