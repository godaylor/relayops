export type RelayOpsConnectionPhase =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "stale";

export type RelayOpsPresenceParticipant = {
  connectionId: string;
  userId: string;
  displayName: string;
  expiresAt: string;
};

export type RelayOpsRealtimeState = {
  versions: Record<string, number>;
  seenEventIds: string[];
  gapIncidentIds: string[];
  presence: Record<string, Record<string, RelayOpsPresenceParticipant>>;
};

export type RelayOpsRealtimeEffect =
  | { type: "ignore" }
  | { type: "invalidate"; incidentId: string }
  | { type: "authoritative-refetch"; incidentId: string }
  | { type: "presence"; incidentId: string };

type IncidentMessage = {
  type:
    | "RELAYOPS_INCIDENT_INVALIDATED"
    | "RELAYOPS_INCIDENT_CREATED"
    | "RELAYOPS_INCIDENT_CHANGED";
  workspaceId: string;
  incidentId: string;
  version: number;
  eventId?: string;
  v?: number;
};

type PresenceMessage = {
  v: 1;
  type: "RELAYOPS_PRESENCE";
  workspaceId: string;
  incidentId: string;
  action: "heartbeat" | "leave";
  participant: RelayOpsPresenceParticipant;
};

const MAX_SEEN_EVENTS = 256;

export function createRelayOpsRealtimeState(): RelayOpsRealtimeState {
  return {
    versions: {},
    seenEventIds: [],
    gapIncidentIds: [],
    presence: {},
  };
}

function isIncidentMessage(value: unknown): value is IncidentMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<IncidentMessage>;
  return (
    (message.type === "RELAYOPS_INCIDENT_INVALIDATED" ||
      message.type === "RELAYOPS_INCIDENT_CREATED" ||
      message.type === "RELAYOPS_INCIDENT_CHANGED") &&
    typeof message.workspaceId === "string" &&
    typeof message.incidentId === "string" &&
    typeof message.version === "number" &&
    Number.isSafeInteger(message.version) &&
    message.version > 0 &&
    (message.type !== "RELAYOPS_INCIDENT_INVALIDATED" || message.v === 1)
  );
}

function isPresenceMessage(value: unknown): value is PresenceMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<PresenceMessage>;
  const participant = message.participant as
    | Partial<RelayOpsPresenceParticipant>
    | undefined;
  return (
    message.v === 1 &&
    message.type === "RELAYOPS_PRESENCE" &&
    typeof message.workspaceId === "string" &&
    typeof message.incidentId === "string" &&
    (message.action === "heartbeat" || message.action === "leave") &&
    typeof participant?.connectionId === "string" &&
    typeof participant.userId === "string" &&
    typeof participant.displayName === "string" &&
    typeof participant.expiresAt === "string"
  );
}

export function expireRelayOpsPresence(
  state: RelayOpsRealtimeState,
  nowMs = Date.now(),
): RelayOpsRealtimeState {
  let changed = false;
  const presence: RelayOpsRealtimeState["presence"] = {};
  for (const [incidentId, participants] of Object.entries(state.presence)) {
    const active = Object.fromEntries(
      Object.entries(participants).filter(([, participant]) => {
        const keep = new Date(participant.expiresAt).getTime() > nowMs;
        if (!keep) changed = true;
        return keep;
      }),
    );
    if (Object.keys(active).length > 0) presence[incidentId] = active;
  }
  return changed ? { ...state, presence } : state;
}

export function reduceRelayOpsRealtimeMessage(
  current: RelayOpsRealtimeState,
  value: unknown,
  workspaceId: string,
  nowMs = Date.now(),
): { state: RelayOpsRealtimeState; effect: RelayOpsRealtimeEffect } {
  const state = expireRelayOpsPresence(current, nowMs);
  if (isPresenceMessage(value)) {
    if (value.workspaceId !== workspaceId) {
      return { state, effect: { type: "ignore" } };
    }
    const incidentPresence = { ...(state.presence[value.incidentId] ?? {}) };
    if (
      value.action === "leave" ||
      new Date(value.participant.expiresAt).getTime() <= nowMs
    ) {
      delete incidentPresence[value.participant.connectionId];
    } else {
      incidentPresence[value.participant.connectionId] = value.participant;
    }
    const presence = { ...state.presence };
    if (Object.keys(incidentPresence).length > 0) {
      presence[value.incidentId] = incidentPresence;
    } else {
      delete presence[value.incidentId];
    }
    return {
      state: { ...state, presence },
      effect: { type: "presence", incidentId: value.incidentId },
    };
  }

  if (!isIncidentMessage(value) || value.workspaceId !== workspaceId) {
    return { state, effect: { type: "ignore" } };
  }
  if (value.eventId && state.seenEventIds.includes(value.eventId)) {
    return { state, effect: { type: "ignore" } };
  }
  const previous = state.versions[value.incidentId];
  if (previous !== undefined && value.version <= previous) {
    return { state, effect: { type: "ignore" } };
  }
  const seenEventIds = value.eventId
    ? [...state.seenEventIds, value.eventId].slice(-MAX_SEEN_EVENTS)
    : state.seenEventIds;
  const versions = { ...state.versions, [value.incidentId]: value.version };
  const gap = previous !== undefined && value.version > previous + 1;
  const gapIncidentIds = gap
    ? [...new Set([...state.gapIncidentIds, value.incidentId])]
    : state.gapIncidentIds;
  return {
    state: { ...state, seenEventIds, versions, gapIncidentIds },
    effect: gap
      ? { type: "authoritative-refetch", incidentId: value.incidentId }
      : { type: "invalidate", incidentId: value.incidentId },
  };
}

export function markRelayOpsIncidentAuthoritative(
  state: RelayOpsRealtimeState,
  incidentId: string,
  version: number,
): RelayOpsRealtimeState {
  return {
    ...state,
    versions: { ...state.versions, [incidentId]: version },
    gapIncidentIds: state.gapIncidentIds.filter((id) => id !== incidentId),
  };
}
