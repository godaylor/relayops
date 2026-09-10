import { windowId } from "@kaneo/libs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/fetchers/get-api-url";
import { authClient } from "@/lib/auth-client";
import {
  ingestRelayOpsRealtimeMessage,
  markRelayOpsAuthoritativeSync,
  registerRelayOpsRealtimeTransport,
  setRelayOpsConnectionSnapshot,
} from "./relayops/realtime-store";

export function getUserWsUrl() {
  const base = getApiUrl("ws");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/user?windowId=${encodeURIComponent(windowId)}`;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 5_000;
const WS_PING_INTERVAL_MS = 30_000;

type ConnectionPhase =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "stale";

/**
 * Maintains the user-scoped socket. PostgreSQL remains authoritative: gaps and
 * reconnects invalidate active RelayOps queries before the UI is marked fresh.
 */
export function useUserWebSocket(options?: {
  relayOpsWorkspaceId?: string;
  onRelayOpsIncident?: (incidentId: string) => void;
}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionPhase>("connecting");
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasConnectedRef = useRef(false);
  const relayOpsCallbackRef = useRef(options?.onRelayOpsIncident);
  const workspaceId = options?.relayOpsWorkspaceId;
  relayOpsCallbackRef.current = options?.onRelayOpsIncident;

  useEffect(() => {
    if (!session?.user?.id) {
      setConnectionState("offline");
      if (workspaceId) {
        setRelayOpsConnectionSnapshot(workspaceId, {
          connection: "offline",
          reconnectAt: null,
          stale: true,
        });
      }
      return;
    }

    retriesRef.current = 0;
    let disposed = false;
    let suppressReconnect = false;

    function setPhase(
      connection: ConnectionPhase,
      update?: {
        reconnectAt?: number | null;
        reconnectAttempt?: number;
        stale?: boolean;
      },
    ) {
      setConnectionState(connection);
      if (workspaceId) {
        setRelayOpsConnectionSnapshot(workspaceId, {
          connection,
          ...update,
        });
      }
    }

    function clearPing() {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    }

    function connect() {
      if (disposed) return;
      if (!navigator.onLine) {
        setPhase("offline", { reconnectAt: null, stale: true });
        return;
      }
      setPhase(hasConnectedRef.current ? "reconnecting" : "connecting", {
        reconnectAt: null,
        reconnectAttempt: retriesRef.current,
        stale: hasConnectedRef.current,
      });
      const ws = new WebSocket(getUserWsUrl());
      wsRef.current = ws;

      ws.onopen = async () => {
        if (disposed) return;
        const reconnected = hasConnectedRef.current;
        retriesRef.current = 0;
        setPhase("connected", {
          reconnectAt: null,
          reconnectAttempt: 0,
          stale: false,
        });
        if (workspaceId) {
          if (reconnected) {
            await queryClient.invalidateQueries({
              queryKey: ["relayops", workspaceId],
            });
          }
          markRelayOpsAuthoritativeSync(workspaceId);
        }
        hasConnectedRef.current = true;
        clearPing();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, WS_PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as {
            type?: string;
            workspaceId?: string;
          };
          if (message.type === "NOTIFICATION_CREATED") {
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
          if (
            message.type === "WORKSPACE_ROLE_CHANGED" &&
            message.workspaceId
          ) {
            void queryClient.invalidateQueries({
              queryKey: ["workspace-capabilities", message.workspaceId],
            });
            void queryClient.invalidateQueries({
              queryKey: ["workspace-user", "active", message.workspaceId],
            });
          }
          if (workspaceId) {
            const effect = ingestRelayOpsRealtimeMessage(workspaceId, message);
            if (
              effect.type === "invalidate" ||
              effect.type === "authoritative-refetch"
            ) {
              void queryClient.invalidateQueries({
                queryKey: ["relayops", workspaceId],
              });
              relayOpsCallbackRef.current?.(effect.incidentId);
              if (effect.type === "authoritative-refetch") {
                void queryClient.refetchQueries({
                  queryKey: ["relayops", workspaceId],
                  type: "active",
                });
              }
            }
          }
        } catch {
          // Malformed transport frames never become authoritative state.
        }
      };

      ws.onclose = () => {
        clearPing();
        wsRef.current = null;
        if (disposed) return;
        if (suppressReconnect) {
          suppressReconnect = false;
          return;
        }
        if (!navigator.onLine) {
          setPhase("offline", { reconnectAt: null, stale: true });
          return;
        }
        if (retriesRef.current >= MAX_RETRIES) {
          setPhase("stale", {
            reconnectAt: null,
            reconnectAttempt: retriesRef.current,
            stale: true,
          });
          return;
        }
        const delay = Math.min(
          MAX_RECONNECT_DELAY_MS,
          BASE_DELAY_MS * 2 ** retriesRef.current,
        );
        retriesRef.current += 1;
        setPhase("reconnecting", {
          reconnectAt: Date.now() + delay,
          reconnectAttempt: retriesRef.current,
          stale: true,
        });
        timeoutRef.current = setTimeout(connect, delay);
      };
    }

    function retry() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      retriesRef.current = 0;
      if (wsRef.current) {
        suppressReconnect = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      connect();
    }

    function send(value: unknown) {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
      wsRef.current.send(JSON.stringify(value));
      return true;
    }

    const unregisterTransport = workspaceId
      ? registerRelayOpsRealtimeTransport(workspaceId, { retry, send })
      : () => {};
    const handleOffline = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      if (wsRef.current) {
        suppressReconnect = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      setPhase("offline", { reconnectAt: null, stale: true });
    };
    const handleOnline = () => {
      if (!wsRef.current) retry();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    connect();

    return () => {
      disposed = true;
      suppressReconnect = true;
      retriesRef.current = MAX_RETRIES;
      clearPing();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      unregisterTransport();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [session?.user?.id, queryClient, workspaceId]);

  return connectionState;
}
