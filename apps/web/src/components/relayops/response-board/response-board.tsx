import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Ban,
  CheckCircle2,
  CircleDot,
  GripVertical,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Radar,
  Search,
  Shield,
  Undo2,
} from "lucide-react";
import {
  type ComponentType,
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { RelayOpsIncidentStatus } from "@/lib/relayops-lifecycle";
import {
  defaultResolveResponseBoardConflict,
  isLifecycleTransitionAllowed,
  isReversibleLifecycleTransition,
  responseBoardKeyboardCoordinates,
  responseBoardLaneId,
  transitionResultSnapshot,
} from "./board-policy";
import {
  type ResponseBoardConflictContext,
  type ResponseBoardIncident,
  type ResponseBoardLabels,
  type ResponseBoardProps,
  type ResponseBoardTransitionOrigin,
  type ResponseBoardUndoContext,
  responseBoardLaneStatuses,
} from "./types";

const laneIcons: Record<
  RelayOpsIncidentStatus,
  ComponentType<{ className?: string }>
> = {
  detected: CircleDot,
  triaging: Search,
  mitigating: Shield,
  monitoring: Radar,
  resolved: CheckCircle2,
  dismissed: Ban,
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

function createFallbackIdempotencyKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `board-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function transitionOrigin(event: Event): ResponseBoardTransitionOrigin {
  if (typeof KeyboardEvent !== "undefined" && event instanceof KeyboardEvent) {
    return "keyboard";
  }
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    return "touch";
  }
  if (
    typeof PointerEvent !== "undefined" &&
    event instanceof PointerEvent &&
    event.pointerType === "touch"
  ) {
    return "touch";
  }
  return "pointer";
}

function incidentFromDragData(value: unknown) {
  if (!value || typeof value !== "object" || !("incident" in value)) {
    return undefined;
  }
  return value.incident as ResponseBoardIncident | undefined;
}

function statusFromDragData(value: unknown) {
  if (!value || typeof value !== "object" || !("status" in value)) {
    return undefined;
  }
  const status = value.status;
  return responseBoardLaneStatuses.includes(status as RelayOpsIncidentStatus)
    ? (status as RelayOpsIncidentStatus)
    : undefined;
}

function focusIncidentControl(incidentId: string) {
  window.setTimeout(() => {
    const card = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-response-board-card-id]",
      ),
    ].find((node) => node.dataset.responseBoardCardId === incidentId);
    card?.querySelector<HTMLElement>("[data-response-board-control]")?.focus();
  }, 0);
}

type IncidentCardProps = {
  incident: ResponseBoardIncident;
  labels: ResponseBoardLabels;
  pending: boolean;
  dragDisabled: boolean;
  canMove: (
    incident: ResponseBoardIncident,
    target: RelayOpsIncidentStatus,
  ) => boolean;
  onMove: (
    incident: ResponseBoardIncident,
    target: RelayOpsIncidentStatus,
    origin: ResponseBoardTransitionOrigin,
    focusTarget?: HTMLElement | null,
  ) => void;
  onOpenIncident?: (incidentId: string) => void;
};

function IncidentCard({
  incident,
  labels,
  pending,
  dragDisabled,
  canMove,
  onMove,
  onOpenIncident,
}: IncidentCardProps) {
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: incident.id,
      data: { incident, status: incident.status },
      disabled: dragDisabled || pending,
    });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.45 : undefined,
    touchAction: isDragging ? "none" : "pan-y",
  };

  return (
    <Card
      aria-busy={pending || undefined}
      className={cn(
        "gap-3 rounded-xl p-3 transition-[border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none",
        isDragging && "border-ring ring-2 ring-ring/30",
      )}
      data-response-board-card-id={incident.id}
      ref={setNodeRef}
      render={<li />}
      style={style}
    >
      <div className="flex min-w-0 items-start gap-2">
        {!dragDisabled ? (
          <Button
            {...attributes}
            {...listeners}
            aria-label={labels.dragHandle(incident.title)}
            className="-ms-1 min-h-11 min-w-11 cursor-grab touch-none active:cursor-grabbing"
            data-response-board-control
            disabled={pending}
            size="icon-xl"
            variant="ghost"
          >
            <GripVertical />
          </Button>
        ) : null}

        <div className="min-w-0 flex-1 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-muted-foreground text-xs">
              {incident.key}
            </span>
            <Badge variant="outline">
              {labels.severityById[incident.severity]}
            </Badge>
          </div>
          {onOpenIncident ? (
            <button
              aria-label={labels.openIncident(incident.title)}
              className="mt-1 block min-h-11 w-full rounded-md text-start font-medium text-sm leading-5 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              onClick={() => onOpenIncident(incident.id)}
              type="button"
            >
              {incident.title}
            </button>
          ) : (
            <p className="mt-1 font-medium text-sm leading-5">
              {incident.title}
            </p>
          )}
          <p className="mt-1 truncate text-muted-foreground text-xs">
            {incident.service.name}
          </p>
        </div>

        <Menu>
          <MenuTrigger
            render={
              <Button
                aria-label={labels.moveTo(incident.title)}
                className="min-h-11 min-w-11"
                data-response-board-control
                disabled={pending}
                ref={menuTriggerRef}
                size="icon-xl"
                variant="ghost"
              />
            }
          >
            {pending ? (
              <LoaderCircle className="motion-safe:animate-spin" />
            ) : (
              <MoreHorizontal />
            )}
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>{labels.moveTo(incident.title)}</MenuGroupLabel>
              {responseBoardLaneStatuses.map((target) => {
                const TargetIcon = laneIcons[target];
                const allowed = canMove(incident, target);
                return (
                  <MenuItem
                    aria-label={
                      allowed
                        ? labels.statusById[target]
                        : `${labels.statusById[target]} — ${labels.invalidTarget}`
                    }
                    className="min-h-11"
                    closeOnClick
                    disabled={!allowed || pending}
                    key={target}
                    onClick={() =>
                      onMove(incident, target, "menu", menuTriggerRef.current)
                    }
                  >
                    {allowed ? <TargetIcon /> : <LockKeyhole />}
                    <span className="flex-1">{labels.statusById[target]}</span>
                    {!allowed ? (
                      <span className="text-muted-foreground text-xs">
                        {labels.invalidTarget}
                      </span>
                    ) : null}
                  </MenuItem>
                );
              })}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
      {pending ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <LoaderCircle className="size-3.5 motion-safe:animate-spin" />
          {labels.pending}
        </div>
      ) : null}
    </Card>
  );
}

type BoardLaneProps = {
  status: RelayOpsIncidentStatus;
  incidents: ResponseBoardIncident[];
  labels: ResponseBoardLabels;
  activeIncident?: ResponseBoardIncident;
  over: boolean;
  pendingIds: Set<string>;
  dragDisabled: boolean;
  canMove: IncidentCardProps["canMove"];
  onMove: IncidentCardProps["onMove"];
  onOpenIncident?: IncidentCardProps["onOpenIncident"];
};

function BoardLane({
  status,
  incidents,
  labels,
  activeIncident,
  over,
  pendingIds,
  dragDisabled,
  canMove,
  onMove,
  onOpenIncident,
}: BoardLaneProps) {
  const { setNodeRef } = useDroppable({
    id: responseBoardLaneId(status),
    data: { status },
  });
  const LaneIcon = laneIcons[status];
  const validTarget = !activeIncident || canMove(activeIncident, status);

  return (
    <section
      aria-disabled={activeIncident && !validTarget ? true : undefined}
      aria-label={labels.statusById[status]}
      className={cn(
        "flex min-h-80 w-80 shrink-0 flex-col rounded-2xl border bg-muted/24 p-3 transition-[border-color,box-shadow,background-color] duration-150 motion-reduce:transition-none",
        over && validTarget && "border-ring bg-accent/40 ring-2 ring-ring/30",
        over && !validTarget && "border-destructive ring-2 ring-destructive/30",
      )}
      data-drop-state={
        activeIncident ? (validTarget ? "valid" : "invalid") : "idle"
      }
      data-response-board-lane={status}
      ref={setNodeRef}
    >
      <header className="mb-3 flex min-h-11 items-center gap-2 px-1">
        <LaneIcon aria-hidden="true" className="size-4.5" />
        <h2 className="font-semibold text-sm">{labels.statusById[status]}</h2>
        <Badge className="ms-auto" variant="secondary">
          {labels.count(incidents.length)}
        </Badge>
      </header>

      {activeIncident && !validTarget ? (
        <div className="mb-3 flex min-h-11 items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-xs">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {labels.invalidTargetDescription(
              activeIncident.title,
              labels.statusById[status],
            )}
          </span>
        </div>
      ) : null}

      <ul
        aria-label={`${labels.statusById[status]} · ${labels.count(incidents.length)}`}
        className="flex flex-1 list-none flex-col gap-2 p-0"
      >
        {incidents.map((incident) => (
          <IncidentCard
            canMove={canMove}
            dragDisabled={dragDisabled}
            incident={incident}
            key={incident.id}
            labels={labels}
            onMove={onMove}
            onOpenIncident={onOpenIncident}
            pending={pendingIds.has(incident.id)}
          />
        ))}
        {incidents.length === 0 ? (
          <li className="flex min-h-24 flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center text-muted-foreground text-xs">
            {labels.emptyLane}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function OverlayCard({
  incident,
  labels,
}: {
  incident: ResponseBoardIncident;
  labels: ResponseBoardLabels;
}) {
  return (
    <Card className="w-72 rotate-1 gap-2 rounded-xl border-ring p-3 opacity-90 shadow-xl ring-2 ring-ring/30 motion-reduce:rotate-0 motion-reduce:transition-none">
      <div className="flex items-center gap-2">
        <GripVertical className="size-4" />
        <span className="font-mono text-muted-foreground text-xs">
          {incident.key}
        </span>
        <Badge variant="outline">
          {labels.severityById[incident.severity]}
        </Badge>
      </div>
      <p className="font-medium text-sm">{incident.title}</p>
      <p className="text-muted-foreground text-xs">{incident.service.name}</p>
    </Card>
  );
}

export function ResponseBoard({
  incidents,
  labels,
  onTransition,
  canTransition,
  dndEnabled = true,
  createIdempotencyKey = createFallbackIdempotencyKey,
  resolveConflict,
  onCompareConflict,
  onDiscardConflict,
  onOpenIncident,
}: ResponseBoardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const dragDisabled = !dndEnabled || reducedMotion;
  const [projectedById, setProjectedById] = useState(
    () => new Map(incidents.map((incident) => [incident.id, incident])),
  );
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef(new Set<string>());
  const [activeId, setActiveId] = useState<string>();
  const [overStatus, setOverStatus] = useState<RelayOpsIncidentStatus>();
  const activeOriginRef = useRef<ResponseBoardTransitionOrigin>("pointer");
  const [announcement, setAnnouncement] = useState("");
  const [lastError, setLastError] = useState<string>();
  const [conflict, setConflict] = useState<ResponseBoardConflictContext>();
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [undo, setUndo] = useState<ResponseBoardUndoContext>();

  useEffect(() => {
    setProjectedById((current) => {
      const next = new Map<string, ResponseBoardIncident>();
      for (const incident of incidents) {
        const projected = current.get(incident.id);
        if (
          projected &&
          (pendingRef.current.has(incident.id) ||
            projected.version > incident.version)
        ) {
          next.set(incident.id, projected);
        } else {
          next.set(incident.id, incident);
        }
      }
      return next;
    });
  }, [incidents]);

  const projectedIncidents = useMemo(
    () =>
      incidents
        .map((incident) => projectedById.get(incident.id) ?? incident)
        .sort((a, b) => a.key.localeCompare(b.key)),
    [incidents, projectedById],
  );
  const activeIncident = activeId ? projectedById.get(activeId) : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: responseBoardKeyboardCoordinates,
    }),
  );

  const canMove = (
    incident: ResponseBoardIncident,
    target: RelayOpsIncidentStatus,
  ) =>
    isLifecycleTransitionAllowed(incident.status, target) &&
    (canTransition?.(incident, target) ?? true);

  const restoreFocus = (
    incidentId: string,
    preferredTarget?: HTMLElement | null,
  ) => {
    window.setTimeout(() => {
      if (preferredTarget?.isConnected) {
        preferredTarget.focus();
      } else {
        focusIncidentControl(incidentId);
      }
    }, 0);
  };

  async function performTransition(
    incident: ResponseBoardIncident,
    target: RelayOpsIncidentStatus,
    origin: ResponseBoardTransitionOrigin,
    focusTarget?: HTMLElement | null,
    existingIdempotencyKey?: string,
  ) {
    if (pendingRef.current.has(incident.id)) return;
    if (!canMove(incident, target)) {
      setAnnouncement(
        labels.invalid(incident.title, labels.statusById[target]),
      );
      restoreFocus(incident.id, focusTarget);
      return;
    }

    const idempotencyKey = existingIdempotencyKey ?? createIdempotencyKey();
    const attempt = {
      incidentId: incident.id,
      incidentTitle: incident.title,
      from: incident.status,
      to: target,
      expectedVersion: incident.version,
      idempotencyKey,
      origin,
    } as const;

    pendingRef.current.add(incident.id);
    setPendingIds(new Set(pendingRef.current));
    setLastError(undefined);
    setUndo(undefined);
    setProjectedById((current) => {
      const next = new Map(current);
      next.set(incident.id, { ...incident, status: target });
      return next;
    });
    setAnnouncement(labels.target(incident.title, labels.statusById[target]));

    try {
      const result = await onTransition({
        incidentId: incident.id,
        to: target,
        expectedVersion: incident.version,
        idempotencyKey,
        origin,
      });
      const snapshot = transitionResultSnapshot(result, {
        status: target,
        version: incident.version + 1,
      });
      const transitioned = { ...incident, ...snapshot };
      setProjectedById((current) => {
        const next = new Map(current);
        next.set(incident.id, transitioned);
        return next;
      });
      setConflict(undefined);
      setComparisonOpen(false);
      setAnnouncement(
        labels.accepted(incident.title, labels.statusById[snapshot.status]),
      );
      if (
        origin !== "undo" &&
        isReversibleLifecycleTransition(attempt.from, snapshot.status)
      ) {
        setUndo({
          incident: transitioned,
          from: attempt.from,
          to: snapshot.status,
        });
      }
    } catch (error) {
      const snapshot = (resolveConflict ?? defaultResolveResponseBoardConflict)(
        error,
        attempt,
        incident,
      );
      if (snapshot) {
        const current = { ...incident, ...snapshot };
        const context = {
          attempt,
          current,
          message: error instanceof Error ? error.message : undefined,
        };
        setProjectedById((state) => {
          const next = new Map(state);
          next.set(incident.id, current);
          return next;
        });
        setConflict(context);
        setComparisonOpen(false);
      } else {
        setProjectedById((current) => {
          const next = new Map(current);
          next.set(incident.id, incident);
          return next;
        });
        setLastError(
          error instanceof Error ? error.message : labels.failedTitle,
        );
      }
      setAnnouncement(
        labels.rollback(incident.title, labels.statusById[incident.status]),
      );
    } finally {
      pendingRef.current.delete(incident.id);
      setPendingIds(new Set(pendingRef.current));
      restoreFocus(incident.id, focusTarget);
    }
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      const incident = incidentFromDragData(active.data.current);
      return incident
        ? labels.lift(incident.title, labels.statusById[incident.status])
        : undefined;
    },
    onDragOver({ active, over }) {
      const incident = incidentFromDragData(active.data.current);
      const target = statusFromDragData(over?.data.current);
      if (!incident || !target) return undefined;
      return canMove(incident, target)
        ? labels.target(incident.title, labels.statusById[target])
        : labels.invalid(incident.title, labels.statusById[target]);
    },
    onDragEnd({ active, over }) {
      const incident = incidentFromDragData(active.data.current);
      const target = statusFromDragData(over?.data.current);
      if (!incident || !target) {
        return incident ? labels.cancelled(incident.title) : undefined;
      }
      return canMove(incident, target)
        ? labels.dropPending(incident.title, labels.statusById[target])
        : labels.invalid(incident.title, labels.statusById[target]);
    },
    onDragCancel({ active }) {
      const incident = incidentFromDragData(active.data.current);
      return incident ? labels.cancelled(incident.title) : undefined;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    activeOriginRef.current = transitionOrigin(event.activatorEvent);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverStatus(statusFromDragData(event.over?.data.current));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const incident = incidentFromDragData(event.active.data.current);
    const target = statusFromDragData(event.over?.data.current);
    const focusTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    setActiveId(undefined);
    setOverStatus(undefined);
    if (!incident) return;
    if (!target || !canMove(incident, target)) {
      setAnnouncement(
        target
          ? labels.invalid(incident.title, labels.statusById[target])
          : labels.cancelled(incident.title),
      );
      restoreFocus(incident.id, focusTarget);
      return;
    }
    void performTransition(
      incident,
      target,
      activeOriginRef.current,
      focusTarget,
    );
  };

  const handleDragCancel = () => {
    const incident = activeId ? projectedById.get(activeId) : undefined;
    setActiveId(undefined);
    setOverStatus(undefined);
    if (incident) {
      setAnnouncement(labels.cancelled(incident.title));
      focusIncidentControl(incident.id);
    }
  };

  const handleCompare = () => {
    if (!conflict) return;
    setComparisonOpen((open) => !open);
    onCompareConflict?.(conflict);
  };

  const handleDiscard = () => {
    if (!conflict) return;
    onDiscardConflict?.(conflict);
    const incidentId = conflict.current.id;
    setConflict(undefined);
    setComparisonOpen(false);
    focusIncidentControl(incidentId);
  };

  const handleReapply = () => {
    if (!conflict) return;
    void performTransition(
      conflict.current,
      conflict.attempt.to,
      "reapply",
      undefined,
      conflict.attempt.idempotencyKey,
    );
  };

  const handleUndo = () => {
    if (!undo) return;
    const current = undo.incident;
    const target = undo.from;
    setUndo(undefined);
    void performTransition(current, target, "undo");
  };

  return (
    <section aria-labelledby="response-board-title" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl" id="response-board-title">
            {labels.title}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {labels.description}
          </p>
        </div>
        {dragDisabled ? (
          <Badge className="min-h-8" variant="outline">
            <LockKeyhole />
            {reducedMotion ? labels.reducedMotionFallback : labels.dndDisabled}
          </Badge>
        ) : null}
      </div>

      {lastError ? (
        <Alert variant="error">
          <AlertTitle>{labels.failedTitle}</AlertTitle>
          <AlertDescription>{lastError}</AlertDescription>
        </Alert>
      ) : null}

      {conflict ? (
        <Alert variant="warning">
          <AlertTitle>{labels.conflictTitle}</AlertTitle>
          <AlertDescription>
            <span>
              {labels.conflictDescription(
                conflict.current.title,
                conflict.current.version,
              )}
            </span>
            {comparisonOpen ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-background/60 p-3">
                <dt className="font-medium">{labels.yourMove}</dt>
                <dd>
                  {labels.statusById[conflict.attempt.from]} →{" "}
                  {labels.statusById[conflict.attempt.to]}
                </dd>
                <dt className="font-medium">{labels.currentState}</dt>
                <dd>
                  {labels.statusById[conflict.current.status]} · v
                  {conflict.current.version}
                </dd>
              </dl>
            ) : null}
          </AlertDescription>
          <AlertAction className="flex-wrap">
            <Button onClick={handleCompare} size="sm" variant="outline">
              {labels.compare}
            </Button>
            <Button
              disabled={!canMove(conflict.current, conflict.attempt.to)}
              onClick={handleReapply}
              size="sm"
            >
              {labels.reapply}
            </Button>
            <Button onClick={handleDiscard} size="sm" variant="ghost">
              {labels.discard}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {undo ? (
        <Alert variant="success">
          <Undo2 />
          <AlertDescription>
            {labels.undoDescription(
              undo.incident.title,
              labels.statusById[undo.from],
              labels.statusById[undo.to],
            )}
          </AlertDescription>
          <AlertAction>
            <Button onClick={handleUndo} size="sm" variant="outline">
              <Undo2 />
              {labels.undo}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <DndContext
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: labels.screenReaderInstructions,
          },
        }}
        collisionDetection={closestCenter}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="overflow-x-auto pb-3 [-webkit-overflow-scrolling:touch]">
          <div className="flex min-w-max gap-3">
            {responseBoardLaneStatuses.map((status) => (
              <BoardLane
                activeIncident={activeIncident}
                canMove={canMove}
                dragDisabled={dragDisabled}
                incidents={projectedIncidents.filter(
                  (incident) => incident.status === status,
                )}
                key={status}
                labels={labels}
                onMove={(incident, target, origin, focusTarget) =>
                  void performTransition(incident, target, origin, focusTarget)
                }
                onOpenIncident={onOpenIncident}
                over={overStatus === status}
                pendingIds={pendingIds}
                status={status}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {activeIncident && !reducedMotion ? (
            <OverlayCard incident={activeIncident} labels={labels} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </section>
  );
}
