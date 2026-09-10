import { useEffect } from "react";
import {
  sendRelayOpsRealtime,
  sweepRelayOpsClientPresence,
  useRelayOpsRealtimeState,
} from "./realtime-store";

const HEARTBEAT_MS = 15_000;

export function useRelayOpsPresence(workspaceId: string, incidentId: string) {
  const realtime = useRelayOpsRealtimeState(workspaceId);

  useEffect(() => {
    if (realtime.connection !== "connected") return;

    function send(action: "heartbeat" | "leave") {
      sendRelayOpsRealtime(workspaceId, {
        v: 1,
        type: "RELAYOPS_PRESENCE",
        action,
        workspaceId,
        incidentId,
      });
    }
    send("heartbeat");
    const heartbeat = setInterval(() => send("heartbeat"), HEARTBEAT_MS);
    const sweep = setInterval(
      () => sweepRelayOpsClientPresence(workspaceId),
      HEARTBEAT_MS,
    );
    return () => {
      clearInterval(heartbeat);
      clearInterval(sweep);
      send("leave");
    };
  }, [workspaceId, incidentId, realtime.connection]);

  const byConnection = realtime.data.presence[incidentId] ?? {};
  const byUser = new Map(
    Object.values(byConnection).map((participant) => [
      participant.userId,
      participant,
    ]),
  );
  return [...byUser.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}
