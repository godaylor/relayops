import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import {
  type RelayOpsIncidentStatus,
  relayOpsAllowedTransitions,
} from "@/lib/relayops-lifecycle";
import {
  type ResponseBoardConflictSnapshot,
  type ResponseBoardTransitionResult,
  responseBoardLaneStatuses,
} from "./types";

export const responseBoardLaneId = (status: RelayOpsIncidentStatus) =>
  `response-board-lane:${status}`;

export function isCanonicalRelayOpsStatus(
  value: unknown,
): value is RelayOpsIncidentStatus {
  return (
    typeof value === "string" &&
    responseBoardLaneStatuses.includes(value as RelayOpsIncidentStatus)
  );
}

export function isLifecycleTransitionAllowed(
  from: RelayOpsIncidentStatus,
  to: RelayOpsIncidentStatus,
) {
  return (
    relayOpsAllowedTransitions[from] as readonly RelayOpsIncidentStatus[]
  ).includes(to);
}

export function isReversibleLifecycleTransition(
  from: RelayOpsIncidentStatus,
  to: RelayOpsIncidentStatus,
) {
  return (
    isLifecycleTransitionAllowed(from, to) &&
    isLifecycleTransitionAllowed(to, from)
  );
}

export function adjacentResponseBoardStatus(
  status: RelayOpsIncidentStatus,
  direction: "previous" | "next",
) {
  const index = responseBoardLaneStatuses.indexOf(status);
  const nextIndex = direction === "next" ? index + 1 : index - 1;
  return responseBoardLaneStatuses[nextIndex];
}

export const responseBoardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") {
    return undefined;
  }

  const activeStatus = context.active?.data.current?.status;
  if (!isCanonicalRelayOpsStatus(activeStatus)) return undefined;

  const target = adjacentResponseBoardStatus(
    activeStatus,
    event.code === "ArrowRight" ? "next" : "previous",
  );
  if (!target) return undefined;

  const targetRect = context.droppableRects.get(responseBoardLaneId(target));
  const collisionRect = context.collisionRect;
  if (!targetRect || !collisionRect) return undefined;

  return {
    x:
      currentCoordinates.x +
      targetRect.left +
      targetRect.width / 2 -
      (collisionRect.left + collisionRect.width / 2),
    y:
      currentCoordinates.y +
      targetRect.top +
      targetRect.height / 2 -
      (collisionRect.top + collisionRect.height / 2),
  };
};

export function transitionResultSnapshot(
  result: ResponseBoardTransitionResult,
  fallback: ResponseBoardConflictSnapshot,
): ResponseBoardConflictSnapshot {
  if (!result) return fallback;
  if (result.incident) return result.incident;
  if (
    isCanonicalRelayOpsStatus(result.status) &&
    typeof result.version === "number"
  ) {
    return { status: result.status, version: result.version };
  }
  return fallback;
}

export function defaultResolveResponseBoardConflict(
  error: unknown,
): ResponseBoardConflictSnapshot | null {
  if (!error || typeof error !== "object") return null;

  const body = "body" in error ? error.body : undefined;
  if (!body || typeof body !== "object") return null;
  if ("code" in body && body.code !== "version_conflict") return null;

  const current = "current" in body ? body.current : undefined;
  if (!current || typeof current !== "object") return null;
  const incident = "incident" in current ? current.incident : current;
  if (!incident || typeof incident !== "object") return null;

  const status = "status" in incident ? incident.status : undefined;
  const version = "version" in incident ? incident.version : undefined;
  if (!isCanonicalRelayOpsStatus(status) || typeof version !== "number") {
    return null;
  }
  return { status, version };
}
