import { randomUUID } from "node:crypto";
import type { RelayOpsPresenceEnvelope } from "./realtime";

export const RELAYOPS_PRESENCE_TTL_MS = 45_000;
export const RELAYOPS_PRESENCE_ROOM_CAP = 100;

type PresenceEntry = RelayOpsPresenceEnvelope["participant"] & {
  workspaceId: string;
  incidentId: string;
  expiresAtMs: number;
};

type PresenceClock = {
  now(): number;
};

function requireIdentifier(value: string, name: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Error(`Invalid RelayOps presence ${name}`);
  }
  return normalized;
}

/**
 * Ephemeral collaboration hint only. Callers must authorize workspace/incident
 * access before touching this registry; its contents are never audit evidence.
 */
export class RelayOpsPresenceRegistry {
  private readonly entries = new Map<string, PresenceEntry>();

  constructor(
    private readonly clock: PresenceClock = { now: () => Date.now() },
    private readonly ttlMs = RELAYOPS_PRESENCE_TTL_MS,
    private readonly roomCap = RELAYOPS_PRESENCE_ROOM_CAP,
  ) {}

  heartbeat(input: {
    connectionId?: string;
    workspaceId: string;
    incidentId: string;
    userId: string;
    displayName: string;
  }): RelayOpsPresenceEnvelope {
    this.sweep();
    const connectionId = input.connectionId ?? randomUUID();
    const workspaceId = requireIdentifier(input.workspaceId, "workspaceId");
    const incidentId = requireIdentifier(input.incidentId, "incidentId");
    const userId = requireIdentifier(input.userId, "userId");
    const displayName = input.displayName.trim().slice(0, 200) || "User";
    const existing = this.entries.get(connectionId);
    const roomSize = [...this.entries.values()].filter(
      (entry) =>
        entry.workspaceId === workspaceId && entry.incidentId === incidentId,
    ).length;
    if (!existing && roomSize >= this.roomCap) {
      throw new Error("RelayOps presence room capacity reached");
    }
    if (
      existing &&
      (existing.userId !== userId || existing.workspaceId !== workspaceId)
    ) {
      throw new Error("RelayOps presence connection identity changed");
    }

    const expiresAtMs = this.clock.now() + this.ttlMs;
    const entry: PresenceEntry = {
      connectionId,
      workspaceId,
      incidentId,
      userId,
      displayName,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
    };
    this.entries.set(connectionId, entry);
    return this.envelope("heartbeat", entry);
  }

  leave(connectionId: string): RelayOpsPresenceEnvelope | null {
    const entry = this.entries.get(connectionId);
    if (!entry) return null;
    this.entries.delete(connectionId);
    return this.envelope("leave", entry);
  }

  list(workspaceId: string, incidentId: string) {
    this.sweep();
    return [...this.entries.values()]
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId && entry.incidentId === incidentId,
      )
      .map(
        ({
          expiresAtMs: _expiresAtMs,
          workspaceId: _workspaceId,
          incidentId: _incidentId,
          ...participant
        }) => participant,
      )
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  sweep() {
    const now = this.clock.now();
    let expired = 0;
    for (const [connectionId, entry] of this.entries) {
      if (entry.expiresAtMs <= now) {
        this.entries.delete(connectionId);
        expired += 1;
      }
    }
    return expired;
  }

  private envelope(
    action: RelayOpsPresenceEnvelope["action"],
    entry: PresenceEntry,
  ): RelayOpsPresenceEnvelope {
    return {
      v: 1,
      type: "RELAYOPS_PRESENCE",
      workspaceId: entry.workspaceId,
      incidentId: entry.incidentId,
      action,
      participant: {
        connectionId: entry.connectionId,
        userId: entry.userId,
        displayName: entry.displayName,
        expiresAt: entry.expiresAt,
      },
    };
  }
}

export const relayOpsPresence = new RelayOpsPresenceRegistry();
