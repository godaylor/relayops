import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import type { RelayOpsOutboxPayload } from "../database/schema";
import type {
  IncidentImpact,
  IncidentSeverity,
  IncidentStatus,
} from "./lifecycle";

type CreateIncidentInput = {
  serviceId: string;
  title: string;
  summary?: string;
  severity: IncidentSeverity;
  impact: IncidentImpact;
  idempotencyKey: string;
  demoDataSetId?: string;
};

function withIncidentKey<
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
    status: incident.status as IncidentStatus,
    severity: incident.severity as IncidentSeverity,
    impact: incident.impact as IncidentImpact,
    key: `INC-${incident.number}`,
    isDemo: Boolean(demoDataSetId),
  };
}

export async function createService(
  workspaceId: string,
  input: { name: string; slug: string; description?: string },
) {
  let created: typeof schema.serviceTable.$inferSelect | undefined;
  try {
    [created] = await db
      .insert(schema.serviceTable)
      .values({
        workspaceId,
        name: input.name,
        slug: input.slug,
        description: input.description || null,
      })
      .returning();
  } catch (error) {
    const databaseError = error as {
      code?: string;
      cause?: { code?: string };
    };
    if ((databaseError.code ?? databaseError.cause?.code) === "23505") {
      throw new HTTPException(409, {
        message: "A service with this slug already exists",
      });
    }
    throw error;
  }

  if (!created) {
    throw new HTTPException(500, { message: "Service was not created" });
  }
  return created;
}

export async function getService(workspaceId: string, id: string) {
  const [service] = await db
    .select()
    .from(schema.serviceTable)
    .where(
      and(
        eq(schema.serviceTable.workspaceId, workspaceId),
        eq(schema.serviceTable.id, id),
      ),
    )
    .limit(1);
  if (!service) throw new HTTPException(404, { message: "Service not found" });
  return service;
}

export async function getIncidentDetailFrom(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  id: string,
) {
  const [row] = await executor
    .select({
      incident: schema.incidentTable,
      service: schema.serviceTable,
    })
    .from(schema.incidentTable)
    .innerJoin(
      schema.serviceTable,
      and(
        eq(schema.incidentTable.workspaceId, schema.serviceTable.workspaceId),
        eq(schema.incidentTable.serviceId, schema.serviceTable.id),
      ),
    )
    .where(
      and(
        eq(schema.incidentTable.workspaceId, workspaceId),
        eq(schema.incidentTable.id, id),
      ),
    )
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Incident not found" });

  const timelineRows = await executor
    .select()
    .from(schema.incidentEventTable)
    .where(
      and(
        eq(schema.incidentEventTable.workspaceId, workspaceId),
        eq(schema.incidentEventTable.incidentId, id),
      ),
    )
    .orderBy(
      asc(schema.incidentEventTable.occurredAt),
      asc(schema.incidentEventTable.id),
    );

  const commander = row.incident.commanderId
    ? ((
        await executor
          .select({
            id: schema.userTable.id,
            name: schema.userTable.name,
          })
          .from(schema.userTable)
          .where(eq(schema.userTable.id, row.incident.commanderId))
          .limit(1)
      )[0] ?? null)
    : null;

  const responders = await executor
    .select({
      id: schema.userTable.id,
      name: schema.userTable.name,
    })
    .from(schema.incidentResponderTable)
    .innerJoin(
      schema.userTable,
      eq(schema.incidentResponderTable.userId, schema.userTable.id),
    )
    .where(
      and(
        eq(schema.incidentResponderTable.workspaceId, workspaceId),
        eq(schema.incidentResponderTable.incidentId, id),
      ),
    )
    .orderBy(asc(schema.userTable.name), asc(schema.userTable.id));

  const affectedServices = await executor
    .select({
      id: schema.serviceTable.id,
      name: schema.serviceTable.name,
      slug: schema.serviceTable.slug,
    })
    .from(schema.incidentAffectedServiceTable)
    .innerJoin(
      schema.serviceTable,
      and(
        eq(
          schema.incidentAffectedServiceTable.workspaceId,
          schema.serviceTable.workspaceId,
        ),
        eq(
          schema.incidentAffectedServiceTable.serviceId,
          schema.serviceTable.id,
        ),
      ),
    )
    .where(
      and(
        eq(schema.incidentAffectedServiceTable.workspaceId, workspaceId),
        eq(schema.incidentAffectedServiceTable.incidentId, id),
      ),
    )
    .orderBy(asc(schema.serviceTable.name), asc(schema.serviceTable.id));

  const timeline = timelineRows.map((event) => ({
    ...event,
    type: event.type as RelayOpsOutboxPayload["type"],
  }));

  return {
    incident: withIncidentKey(row.incident),
    service: {
      ...row.service,
      tier: row.service.tier as "critical" | "high" | "standard" | "low",
      health: row.service.health as
        | "operational"
        | "degraded"
        | "major_outage"
        | "maintenance",
    },
    commander,
    responders,
    affectedServices,
    timeline,
  };
}

export async function getIncidentDetail(workspaceId: string, id: string) {
  return getIncidentDetailFrom(db, workspaceId, id);
}

export async function createIncident(
  workspaceId: string,
  actorUserId: string,
  input: CreateIncidentInput,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`,
    );

    const [existing] = await tx
      .select({ id: schema.incidentTable.id })
      .from(schema.incidentTable)
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.creationIdempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return getIncidentDetailFrom(tx, workspaceId, existing.id);

    const [service] = await tx
      .select({
        id: schema.serviceTable.id,
        archivedAt: schema.serviceTable.archivedAt,
      })
      .from(schema.serviceTable)
      .where(
        and(
          eq(schema.serviceTable.workspaceId, workspaceId),
          eq(schema.serviceTable.id, input.serviceId),
        ),
      )
      .limit(1);
    if (!service)
      throw new HTTPException(404, { message: "Service not found" });
    if (service.archivedAt)
      throw new HTTPException(422, {
        message: "Archived services cannot receive new incidents",
      });

    const [counter] = await tx
      .select({
        next: sql<number>`coalesce(max(${schema.incidentTable.number}), 0) + 1`,
      })
      .from(schema.incidentTable)
      .where(eq(schema.incidentTable.workspaceId, workspaceId));

    const incidentId = createId();
    const eventId = createId();
    const outboxId = createId();
    const number = Number(counter?.next ?? 1);
    const version = 1;

    await tx.insert(schema.incidentTable).values({
      id: incidentId,
      workspaceId,
      number,
      title: input.title,
      summary: input.summary || null,
      severity: input.severity,
      impact: input.impact,
      serviceId: input.serviceId,
      version,
      creationIdempotencyKey: input.idempotencyKey,
      demoDataSetId: input.demoDataSetId,
      createdBy: actorUserId,
    });
    await tx.insert(schema.incidentEventTable).values({
      id: eventId,
      workspaceId,
      incidentId,
      incidentVersion: version,
      type: "incident.created",
      actorUserId,
      payload: {
        serviceId: input.serviceId,
        severity: input.severity,
        impact: input.impact,
        title: input.title,
      },
      idempotencyKey: input.idempotencyKey,
    });
    await tx.insert(schema.outboxEventTable).values({
      id: outboxId,
      workspaceId,
      aggregateType: "incident",
      aggregateId: incidentId,
      aggregateVersion: version,
      eventType: "incident.created",
      payload: {
        actorUserId,
        workspaceId,
        incidentId,
        version,
        type: "incident.created",
      },
      demoDataSetId: input.demoDataSetId,
    });

    return getIncidentDetailFrom(tx, workspaceId, incidentId);
  });
}
