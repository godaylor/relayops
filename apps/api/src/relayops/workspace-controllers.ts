import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import type { RelayOpsOutboxPayload } from "../database/schema";
import { createIncident } from "./controllers";
import type {
  IncidentImpact,
  IncidentSeverity,
  IncidentStatus,
} from "./lifecycle";
import { listServices } from "./service-controllers";

export const DEMO_DATA_SET_ID = "relayops-onboarding-v1";

function incidentWithKey<
  T extends {
    number: number;
    status: string;
    severity: string;
    impact: string;
    demoDataSetId?: string | null;
    creationIdempotencyKey?: string;
  },
>(incident: T) {
  const {
    creationIdempotencyKey: _idempotencyKey,
    demoDataSetId,
    ...publicIncident
  } = incident;
  return {
    ...publicIncident,
    key: `INC-${incident.number}`,
    status: incident.status as IncidentStatus,
    severity: incident.severity as IncidentSeverity,
    impact: incident.impact as IncidentImpact,
    isDemo: Boolean(demoDataSetId),
  };
}

export async function getWorkspaceState(workspaceId: string) {
  const [workspace] = await db
    .select({
      id: schema.workspaceTable.id,
      productMode: schema.workspaceTable.productMode,
    })
    .from(schema.workspaceTable)
    .where(eq(schema.workspaceTable.id, workspaceId))
    .limit(1);
  if (!workspace)
    throw new HTTPException(404, { message: "Workspace not found" });

  const [[projectCount], [taskCount]] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(schema.taskTable)
      .innerJoin(
        schema.projectTable,
        eq(schema.taskTable.projectId, schema.projectTable.id),
      )
      .where(eq(schema.projectTable.workspaceId, workspaceId)),
  ]);
  return {
    ...workspace,
    productMode: workspace.productMode as "legacy" | "relayops",
    legacyProjectCount: Number(projectCount?.value ?? 0),
    legacyTaskCount: Number(taskCount?.value ?? 0),
  };
}

export async function activateRelayOps(workspaceId: string) {
  const [workspace] = await db
    .update(schema.workspaceTable)
    .set({ productMode: "relayops" })
    .where(eq(schema.workspaceTable.id, workspaceId))
    .returning({ id: schema.workspaceTable.id });
  if (!workspace)
    throw new HTTPException(404, { message: "Workspace not found" });
  return getWorkspaceState(workspaceId);
}

export async function getOverview(workspaceId: string) {
  const [activeRows, services, updateRows, [demoCount]] = await Promise.all([
    db
      .select()
      .from(schema.incidentTable)
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          inArray(schema.incidentTable.status, [
            "detected",
            "triaging",
            "mitigating",
            "monitoring",
          ]),
        ),
      )
      .orderBy(
        asc(schema.incidentTable.severity),
        asc(schema.incidentTable.detectedAt),
      )
      .limit(12),
    listServices(workspaceId, { status: "active" }),
    db
      .select({
        id: schema.incidentEventTable.id,
        incidentId: schema.incidentTable.id,
        incidentNumber: schema.incidentTable.number,
        incidentTitle: schema.incidentTable.title,
        serviceName: schema.serviceTable.name,
        type: schema.incidentEventTable.type,
        occurredAt: schema.incidentEventTable.occurredAt,
      })
      .from(schema.incidentEventTable)
      .innerJoin(
        schema.incidentTable,
        and(
          eq(
            schema.incidentEventTable.workspaceId,
            schema.incidentTable.workspaceId,
          ),
          eq(schema.incidentEventTable.incidentId, schema.incidentTable.id),
        ),
      )
      .innerJoin(
        schema.serviceTable,
        and(
          eq(schema.incidentTable.workspaceId, schema.serviceTable.workspaceId),
          eq(schema.incidentTable.serviceId, schema.serviceTable.id),
        ),
      )
      .where(eq(schema.incidentEventTable.workspaceId, workspaceId))
      .orderBy(desc(schema.incidentEventTable.occurredAt))
      .limit(8),
    db
      .select({ value: count() })
      .from(schema.incidentTable)
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          isNotNull(schema.incidentTable.demoDataSetId),
        ),
      ),
  ]);

  const activeIncidents = activeRows.map(incidentWithKey);
  return {
    activeIncidents,
    degradedServices: services.filter(
      (service) => service.health !== "operational",
    ),
    commanderlessCount: activeIncidents.filter(
      (incident) => !incident.commanderId,
    ).length,
    serviceCount: services.length,
    latestUpdates: updateRows.map((row) => ({
      id: row.id,
      incidentId: row.incidentId,
      incidentKey: `INC-${row.incidentNumber}`,
      incidentTitle: row.incidentTitle,
      serviceName: row.serviceName,
      type: row.type as RelayOpsOutboxPayload["type"],
      occurredAt: row.occurredAt,
    })),
    demoDataCount: Number(demoCount?.value ?? 0),
  };
}

export async function createDemoIncident(
  workspaceId: string,
  actorUserId: string,
  serviceId: string,
) {
  return createIncident(workspaceId, actorUserId, {
    serviceId,
    title: "Checkout latency above error budget",
    summary:
      "Deterministic demo incident. Use it to explore the Incident Room, then remove all demo data from Overview.",
    severity: "sev2",
    impact: "degraded",
    idempotencyKey: `demo:${DEMO_DATA_SET_ID}:${serviceId}`,
    demoDataSetId: DEMO_DATA_SET_ID,
  });
}

export async function removeDemoData(workspaceId: string) {
  return db.transaction(async (tx) => {
    const demoIncidents = await tx
      .select({ id: schema.incidentTable.id })
      .from(schema.incidentTable)
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          isNotNull(schema.incidentTable.demoDataSetId),
        ),
      );
    const ids = demoIncidents.map((row) => row.id);
    const deletedOutbox = await tx
      .delete(schema.outboxEventTable)
      .where(
        and(
          eq(schema.outboxEventTable.workspaceId, workspaceId),
          isNotNull(schema.outboxEventTable.demoDataSetId),
        ),
      )
      .returning({ id: schema.outboxEventTable.id });
    const deletedIncidents =
      ids.length === 0
        ? []
        : await tx
            .delete(schema.incidentTable)
            .where(
              and(
                eq(schema.incidentTable.workspaceId, workspaceId),
                inArray(schema.incidentTable.id, ids),
              ),
            )
            .returning({ id: schema.incidentTable.id });
    const deletedServices = await tx
      .delete(schema.serviceTable)
      .where(
        and(
          eq(schema.serviceTable.workspaceId, workspaceId),
          isNotNull(schema.serviceTable.demoDataSetId),
        ),
      )
      .returning({ id: schema.serviceTable.id });
    return {
      incidents: deletedIncidents.length,
      services: deletedServices.length,
      outboxEvents: deletedOutbox.length,
    };
  });
}

export async function getLegacyArchive(workspaceId: string) {
  const rows = await db
    .select({
      id: schema.projectTable.id,
      name: schema.projectTable.name,
      slug: schema.projectTable.slug,
      archivedAt: schema.projectTable.archivedAt,
      taskCount: count(schema.taskTable.id),
    })
    .from(schema.projectTable)
    .leftJoin(
      schema.taskTable,
      eq(schema.taskTable.projectId, schema.projectTable.id),
    )
    .where(eq(schema.projectTable.workspaceId, workspaceId))
    .groupBy(schema.projectTable.id)
    .orderBy(asc(schema.projectTable.name), asc(schema.projectTable.id));
  return {
    projects: rows.map((row) => ({
      ...row,
      taskCount: Number(row.taskCount),
    })),
  };
}

export async function exportLegacyData(workspaceId: string) {
  const [projects, tasks] = await Promise.all([
    db
      .select({
        id: schema.projectTable.id,
        slug: schema.projectTable.slug,
        name: schema.projectTable.name,
        description: schema.projectTable.description,
        archivedAt: schema.projectTable.archivedAt,
        createdAt: schema.projectTable.createdAt,
      })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.workspaceId, workspaceId))
      .orderBy(asc(schema.projectTable.id)),
    db
      .select({
        id: schema.taskTable.id,
        projectId: schema.taskTable.projectId,
        number: schema.taskTable.number,
        title: schema.taskTable.title,
        description: schema.taskTable.description,
        status: schema.taskTable.status,
        priority: schema.taskTable.priority,
        assigneeId: schema.taskTable.userId,
        startDate: schema.taskTable.startDate,
        dueDate: schema.taskTable.dueDate,
        createdAt: schema.taskTable.createdAt,
        updatedAt: schema.taskTable.updatedAt,
      })
      .from(schema.taskTable)
      .innerJoin(
        schema.projectTable,
        eq(schema.taskTable.projectId, schema.projectTable.id),
      )
      .where(eq(schema.projectTable.workspaceId, workspaceId))
      .orderBy(asc(schema.taskTable.projectId), asc(schema.taskTable.number)),
  ]);
  return {
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    workspaceId,
    projects,
    tasks,
  };
}
