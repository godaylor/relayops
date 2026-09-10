import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import {
  incidentImpacts,
  incidentSeverities,
  incidentStatuses,
} from "./lifecycle";

export const incidentEventTypes = [
  "incident.created",
  "incident.status_changed",
  "incident.severity_changed",
  "incident.assignment_changed",
  "incident.update_published",
  "incident.timestamps_corrected",
  "incident.resolved",
  "incident.dismissed",
  "incident.reopened",
  "incident.signal_attached",
] as const;

export const serviceSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    tier: z.enum(["critical", "high", "standard", "low"]),
    health: z.enum(["operational", "degraded", "major_outage", "maintenance"]),
    ownerTeamId: z.string().nullable(),
    ownerTeamName: z.string().nullable().optional(),
    repositoryUrl: z.string().nullable(),
    runbookUrl: z.string().nullable(),
    archivedAt: nullableResponseTimestamp,
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("RelayOpsService");

export const serviceListSchema = z
  .array(serviceSchema)
  .openapi("RelayOpsServiceList");

export const relayOpsTeamSchema = z
  .object({ id: z.string(), name: z.string() })
  .openapi("RelayOpsTeam");

export const relayOpsWorkspaceSchema = z
  .object({
    id: z.string(),
    productMode: z.enum(["legacy", "relayops"]),
    legacyProjectCount: z.number().int().nonnegative(),
    legacyTaskCount: z.number().int().nonnegative(),
  })
  .openapi("RelayOpsWorkspaceState");

export const incidentSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    number: z.number().int().positive(),
    key: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    status: z.enum(incidentStatuses),
    severity: z.enum(incidentSeverities),
    impact: z.enum(incidentImpacts),
    serviceId: z.string(),
    commanderId: z.string().nullable(),
    resolutionSummary: z.string().nullable(),
    version: z.number().int().positive(),
    createdBy: z.string().nullable(),
    detectedAt: responseTimestamp,
    acknowledgedAt: nullableResponseTimestamp,
    mitigatedAt: nullableResponseTimestamp,
    resolvedAt: nullableResponseTimestamp,
    dismissedAt: nullableResponseTimestamp,
    lastUpdateAt: responseTimestamp,
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
    isDemo: z.boolean(),
  })
  .openapi("RelayOpsIncident");

export const incidentEventSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    incidentId: z.string(),
    incidentVersion: z.number().int().positive(),
    type: z.enum(incidentEventTypes),
    actorUserId: z.string().nullable(),
    occurredAt: responseTimestamp,
    payload: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string(),
  })
  .openapi("RelayOpsIncidentEvent");

export const incidentDetailSchema = z
  .object({
    incident: incidentSchema,
    service: serviceSchema,
    commander: z.object({ id: z.string(), name: z.string() }).nullable(),
    responders: z.array(z.object({ id: z.string(), name: z.string() })),
    affectedServices: z.array(
      z.object({ id: z.string(), name: z.string(), slug: z.string() }),
    ),
    timeline: z.array(incidentEventSchema),
  })
  .openapi("RelayOpsIncidentDetail");

export const incidentTimelinePageSchema = z
  .object({
    items: z.array(incidentEventSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("RelayOpsIncidentTimelinePage");

export const incidentVersionConflictSchema = z
  .object({
    code: z.literal("version_conflict"),
    message: z.string(),
    current: incidentDetailSchema,
  })
  .openapi("RelayOpsIncidentVersionConflict");

export const outboxStateSchema = z
  .object({
    publishedAt: nullableResponseTimestamp,
  })
  .openapi("RelayOpsOutboxState");

export const overviewSchema = z
  .object({
    activeIncidents: z.array(incidentSchema),
    degradedServices: z.array(serviceSchema),
    commanderlessCount: z.number().int().nonnegative(),
    serviceCount: z.number().int().nonnegative(),
    latestUpdates: z.array(
      z.object({
        id: z.string(),
        incidentId: z.string(),
        incidentKey: z.string(),
        incidentTitle: z.string(),
        serviceName: z.string(),
        type: z.enum(incidentEventTypes),
        occurredAt: responseTimestamp,
      }),
    ),
    demoDataCount: z.number().int().nonnegative(),
  })
  .openapi("RelayOpsOverview");

export const demoCleanupSchema = z
  .object({
    incidents: z.number().int().nonnegative(),
    services: z.number().int().nonnegative(),
    outboxEvents: z.number().int().nonnegative(),
  })
  .openapi("RelayOpsDemoCleanup");

export const legacyArchiveSchema = z
  .object({
    projects: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        archivedAt: nullableResponseTimestamp,
        taskCount: z.number().int().nonnegative(),
      }),
    ),
  })
  .openapi("RelayOpsLegacyArchive");

export const legacyExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportedAt: z.string(),
    workspaceId: z.string(),
    projects: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        archivedAt: nullableResponseTimestamp,
        createdAt: responseTimestamp,
      }),
    ),
    tasks: z.array(
      z.object({
        id: z.string(),
        projectId: z.string(),
        number: z.number().int().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        priority: z.string(),
        assigneeId: z.string().nullable(),
        startDate: nullableResponseTimestamp,
        dueDate: nullableResponseTimestamp,
        createdAt: responseTimestamp,
        updatedAt: responseTimestamp,
      }),
    ),
  })
  .openapi("RelayOpsLegacyExport");
