import { useSyncExternalStore } from "react";
import {
  createRelayOpsRealtimeState,
  expireRelayOpsPresence,
  type RelayOpsConnectionPhase,
  type RelayOpsRealtimeEffect,
  type RelayOpsRealtimeState,
  reduceRelayOpsRealtimeMessage,
} from "./realtime-state";

export type RelayOpsRealtimeSnapshot = {
  connection: RelayOpsConnectionPhase;
  reconnectAt: number | null;
  reconnectAttempt: number;
  lastSyncAt: string | null;
  stale: boolean;
  data: RelayOpsRealtimeState;
};

type Store = {
  snapshot: RelayOpsRealtimeSnapshot;
  listeners: Set<() => void>;
  retry: (() => void) | null;
  send: ((value: unknown) => boolean) | null;
};

const stores = new Map<string, Store>();

function getStore(workspaceId: string) {
  let store = stores.get(workspaceId);
  if (!store) {
    store = {
      snapshot: {
        connection: "connecting",
        reconnectAt: null,
        reconnectAttempt: 0,
        lastSyncAt: null,
        stale: true,
        data: createRelayOpsRealtimeState(),
      },
      listeners: new Set(),
      retry: null,
      send: null,
    };
    stores.set(workspaceId, store);
  }
  return store;
}

function emit(store: Store) {
  for (const listener of store.listeners) listener();
}

export function setRelayOpsConnectionSnapshot(
  workspaceId: string,
  update: Partial<Omit<RelayOpsRealtimeSnapshot, "data">>,
) {
  const store = getStore(workspaceId);
  store.snapshot = { ...store.snapshot, ...update };
  emit(store);
}

export function ingestRelayOpsRealtimeMessage(
  workspaceId: string,
  value: unknown,
): RelayOpsRealtimeEffect {
  const store = getStore(workspaceId);
  const reduced = reduceRelayOpsRealtimeMessage(
    store.snapshot.data,
    value,
    workspaceId,
  );
  if (reduced.state !== store.snapshot.data) {
    store.snapshot = {
      ...store.snapshot,
      data: reduced.state,
      stale:
        store.snapshot.stale || reduced.effect.type === "authoritative-refetch",
    };
    emit(store);
  }
  return reduced.effect;
}

export function markRelayOpsAuthoritativeSync(
  workspaceId: string,
  at = new Date(),
) {
  const store = getStore(workspaceId);
  store.snapshot = {
    ...store.snapshot,
    lastSyncAt: at.toISOString(),
    stale: false,
  };
  emit(store);
}

export function registerRelayOpsRealtimeTransport(
  workspaceId: string,
  transport: { retry(): void; send(value: unknown): boolean },
) {
  const store = getStore(workspaceId);
  store.retry = transport.retry;
  store.send = transport.send;
  return () => {
    if (store.retry === transport.retry) store.retry = null;
    if (store.send === transport.send) store.send = null;
  };
}

export function retryRelayOpsRealtime(workspaceId: string) {
  getStore(workspaceId).retry?.();
}

export function sendRelayOpsRealtime(workspaceId: string, value: unknown) {
  return getStore(workspaceId).send?.(value) ?? false;
}

export function sweepRelayOpsClientPresence(workspaceId: string) {
  const store = getStore(workspaceId);
  const data = expireRelayOpsPresence(store.snapshot.data);
  if (data !== store.snapshot.data) {
    store.snapshot = { ...store.snapshot, data };
    emit(store);
  }
}

export function useRelayOpsRealtimeState(workspaceId: string) {
  const store = getStore(workspaceId);
  return useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => store.snapshot,
    () => store.snapshot,
  );
}

export function resetRelayOpsRealtimeStoreForTests() {
  stores.clear();
}
