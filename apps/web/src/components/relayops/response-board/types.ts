import type { RelayOpsIncidentStatus } from "@/lib/relayops-lifecycle";

export const responseBoardLaneStatuses = [
  "detected",
  "triaging",
  "mitigating",
  "monitoring",
  "resolved",
  "dismissed",
] as const satisfies readonly RelayOpsIncidentStatus[];

export type ResponseBoardIncident = {
  id: string;
  key: string;
  title: string;
  summary?: string | null;
  status: RelayOpsIncidentStatus;
  severity: "unknown" | "sev1" | "sev2" | "sev3" | "sev4";
  version: number;
  lastUpdateAt?: string;
  service: { id: string; name: string; slug?: string };
};

export type ResponseBoardTransitionOrigin =
  | "pointer"
  | "touch"
  | "keyboard"
  | "menu"
  | "undo"
  | "reapply";

export type ResponseBoardTransitionCommand = {
  incidentId: string;
  to: RelayOpsIncidentStatus;
  expectedVersion: number;
  idempotencyKey: string;
  origin: ResponseBoardTransitionOrigin;
};

export type ResponseBoardTransitionResult =
  | undefined
  | {
      status?: RelayOpsIncidentStatus;
      version?: number;
      incident?: {
        status: RelayOpsIncidentStatus;
        version: number;
      };
    };

export type ResponseBoardConflictSnapshot = {
  status: RelayOpsIncidentStatus;
  version: number;
};

export type ResponseBoardTransitionAttempt = {
  incidentId: string;
  incidentTitle: string;
  from: RelayOpsIncidentStatus;
  to: RelayOpsIncidentStatus;
  expectedVersion: number;
  idempotencyKey: string;
  origin: ResponseBoardTransitionOrigin;
};

export type ResponseBoardConflictContext = {
  attempt: ResponseBoardTransitionAttempt;
  current: ResponseBoardIncident;
  message?: string;
};

export type ResponseBoardUndoContext = {
  incident: ResponseBoardIncident;
  from: RelayOpsIncidentStatus;
  to: RelayOpsIncidentStatus;
};

export type ResponseBoardLabels = {
  title: string;
  description: string;
  count: (count: number) => string;
  statusById: Record<RelayOpsIncidentStatus, string>;
  severityById: Record<ResponseBoardIncident["severity"], string>;
  dragHandle: (incidentTitle: string) => string;
  moveTo: (incidentTitle: string) => string;
  openIncident: (incidentTitle: string) => string;
  pending: string;
  emptyLane: string;
  invalidTarget: string;
  invalidTargetDescription: (
    incidentTitle: string,
    targetLabel: string,
  ) => string;
  dndDisabled: string;
  reducedMotionFallback: string;
  screenReaderInstructions: string;
  lift: (incidentTitle: string, sourceLabel: string) => string;
  target: (incidentTitle: string, targetLabel: string) => string;
  invalid: (incidentTitle: string, targetLabel: string) => string;
  dropPending: (incidentTitle: string, targetLabel: string) => string;
  cancelled: (incidentTitle: string) => string;
  accepted: (incidentTitle: string, targetLabel: string) => string;
  rollback: (incidentTitle: string, sourceLabel: string) => string;
  failedTitle: string;
  conflictTitle: string;
  conflictDescription: (incidentTitle: string, version: number) => string;
  yourMove: string;
  currentState: string;
  compare: string;
  reapply: string;
  discard: string;
  undo: string;
  undoDescription: (
    incidentTitle: string,
    fromLabel: string,
    toLabel: string,
  ) => string;
};

export type ResponseBoardProps = {
  incidents: ResponseBoardIncident[];
  labels: ResponseBoardLabels;
  onTransition: (
    command: ResponseBoardTransitionCommand,
  ) => Promise<ResponseBoardTransitionResult>;
  canTransition?: (
    incident: ResponseBoardIncident,
    target: RelayOpsIncidentStatus,
  ) => boolean;
  dndEnabled?: boolean;
  createIdempotencyKey?: () => string;
  resolveConflict?: (
    error: unknown,
    attempt: ResponseBoardTransitionAttempt,
    incident: ResponseBoardIncident,
  ) => ResponseBoardConflictSnapshot | null;
  onCompareConflict?: (context: ResponseBoardConflictContext) => void;
  onDiscardConflict?: (context: ResponseBoardConflictContext) => void;
  onOpenIncident?: (incidentId: string) => void;
};
