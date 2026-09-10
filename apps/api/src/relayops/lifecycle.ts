export const incidentStatuses = [
  "detected",
  "triaging",
  "mitigating",
  "monitoring",
  "resolved",
  "dismissed",
] as const;

export type IncidentStatus = (typeof incidentStatuses)[number];

export const incidentSeverities = [
  "unknown",
  "sev1",
  "sev2",
  "sev3",
  "sev4",
] as const;

export type IncidentSeverity = (typeof incidentSeverities)[number];

export const incidentImpacts = [
  "unknown",
  "none",
  "degraded",
  "partial_outage",
  "full_outage",
] as const;

export type IncidentImpact = (typeof incidentImpacts)[number];

export const allowedIncidentTransitions: Record<
  IncidentStatus,
  readonly IncidentStatus[]
> = {
  detected: ["triaging", "dismissed"],
  triaging: ["mitigating", "monitoring", "resolved", "dismissed"],
  mitigating: ["monitoring", "resolved"],
  monitoring: ["mitigating", "resolved"],
  resolved: ["monitoring"],
  dismissed: ["triaging"],
};

export type IncidentLifecycleTimestamps = {
  detectedAt: Date;
  acknowledgedAt: Date | null;
  mitigatedAt: Date | null;
  resolvedAt: Date | null;
  dismissedAt: Date | null;
};

export function isAllowedIncidentTransition(
  from: IncidentStatus,
  to: IncidentStatus,
) {
  return allowedIncidentTransitions[from].includes(to);
}

export function incidentTransitionEventType(
  from: IncidentStatus,
  to: IncidentStatus,
) {
  if (from === "resolved" || from === "dismissed") {
    return "incident.reopened" as const;
  }
  if (to === "resolved") return "incident.resolved" as const;
  if (to === "dismissed") return "incident.dismissed" as const;
  return "incident.status_changed" as const;
}

export function deriveIncidentTransitionTimestamps(
  from: IncidentStatus,
  to: IncidentStatus,
  current: IncidentLifecycleTimestamps,
  occurredAt: Date,
): IncidentLifecycleTimestamps {
  if (!isAllowedIncidentTransition(from, to)) {
    throw new Error(`Transition ${from} -> ${to} is not allowed`);
  }

  const next = { ...current };

  if (from === "detected" && to === "triaging") {
    next.acknowledgedAt ??= occurredAt;
  }

  if (to === "mitigating") {
    next.acknowledgedAt ??= occurredAt;
    if (from === "monitoring") next.mitigatedAt = null;
    next.resolvedAt = null;
    next.dismissedAt = null;
  }

  if (to === "monitoring") {
    next.acknowledgedAt ??= occurredAt;
    next.mitigatedAt ??= occurredAt;
    next.resolvedAt = null;
    next.dismissedAt = null;
  }

  if (to === "resolved") {
    next.acknowledgedAt ??= occurredAt;
    next.mitigatedAt ??= occurredAt;
    next.resolvedAt = occurredAt;
    next.dismissedAt = null;
  }

  if (to === "dismissed") {
    next.resolvedAt = null;
    next.dismissedAt = occurredAt;
  }

  if (from === "dismissed" && to === "triaging") {
    next.acknowledgedAt ??= occurredAt;
    next.mitigatedAt = null;
    next.resolvedAt = null;
    next.dismissedAt = null;
  }

  return next;
}

export function validateIncidentTimestamps(
  status: IncidentStatus,
  timestamps: IncidentLifecycleTimestamps,
) {
  const ordered = [
    timestamps.detectedAt,
    timestamps.acknowledgedAt,
    timestamps.mitigatedAt,
    timestamps.resolvedAt,
  ].filter((value): value is Date => value !== null);

  if (ordered.some((value) => Number.isNaN(value.getTime()))) return false;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]!.getTime() < ordered[index - 1]!.getTime()) {
      return false;
    }
  }

  if (status === "detected") {
    return (
      timestamps.acknowledgedAt === null &&
      timestamps.mitigatedAt === null &&
      timestamps.resolvedAt === null &&
      timestamps.dismissedAt === null
    );
  }
  if (status === "triaging" || status === "mitigating") {
    return (
      timestamps.acknowledgedAt !== null &&
      timestamps.resolvedAt === null &&
      timestamps.dismissedAt === null
    );
  }
  if (status === "monitoring") {
    return (
      timestamps.acknowledgedAt !== null &&
      timestamps.mitigatedAt !== null &&
      timestamps.resolvedAt === null &&
      timestamps.dismissedAt === null
    );
  }
  if (status === "resolved") {
    return (
      timestamps.acknowledgedAt !== null &&
      timestamps.mitigatedAt !== null &&
      timestamps.resolvedAt !== null &&
      timestamps.dismissedAt === null
    );
  }
  return timestamps.resolvedAt === null && timestamps.dismissedAt !== null;
}
