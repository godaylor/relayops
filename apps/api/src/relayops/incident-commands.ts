import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import type { RelayOpsOutboxPayload } from "../database/schema";
import { getIncidentDetailFrom } from "./controllers";
import {
  requireIncidentPolicy,
  requireTimelineCapability,
} from "./incident-policy";
import {
  deriveIncidentTransitionTimestamps,
  type IncidentSeverity,
  type IncidentStatus,
  incidentTransitionEventType,
  isAllowedIncidentTransition,
  validateIncidentTimestamps,
} from "./lifecycle";

type BaseCommand = {
  expectedVersion: number;
  idempotencyKey: string;
};

type PolicyIncident = {
  status: IncidentStatus;
  severity: IncidentSeverity;
  ownerTeamId: string | null;
};

async function getPolicyIncident(
  workspaceId: string,
  incidentId: string,
): Promise<PolicyIncident> {
  const [row] = await db
    .select({
      status: schema.incidentTable.status,
      severity: schema.incidentTable.severity,
      ownerTeamId: schema.serviceTable.ownerTeamId,
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
        eq(schema.incidentTable.id, incidentId),
      ),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Incident not found" });
  return {
    status: row.status as IncidentStatus,
    severity: row.severity as IncidentSeverity,
    ownerTeamId: row.ownerTeamId,
  };
}

function transitionPolicyAction(from: IncidentStatus, to: IncidentStatus) {
  if (from === "resolved" || from === "dismissed") {
    return "reopen" as const;
  }
  if (to === "resolved") return "resolve" as const;
  if (to === "dismissed") return "dismiss" as const;
  return "transition" as const;
}

async function currentOrMissing(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  incidentId: string,
) {
  const [current] = await executor
    .select()
    .from(schema.incidentTable)
    .where(
      and(
        eq(schema.incidentTable.workspaceId, workspaceId),
        eq(schema.incidentTable.id, incidentId),
      ),
    )
    .limit(1);
  if (!current) throw new HTTPException(404, { message: "Incident not found" });
  return current;
}

async function existingCommand(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  incidentId: string,
  idempotencyKey: string,
) {
  const [event] = await executor
    .select({
      type: schema.incidentEventTable.type,
      payload: schema.incidentEventTable.payload,
    })
    .from(schema.incidentEventTable)
    .where(
      and(
        eq(schema.incidentEventTable.workspaceId, workspaceId),
        eq(schema.incidentEventTable.incidentId, incidentId),
        eq(schema.incidentEventTable.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return event;
}

async function conflictResult(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  incidentId: string,
) {
  return {
    kind: "version_conflict" as const,
    current: await getIncidentDetailFrom(executor, workspaceId, incidentId),
  };
}

function assertIdempotentPayload(
  event: { type: string; payload: Record<string, unknown> },
  type: RelayOpsOutboxPayload["type"],
  command: Record<string, unknown>,
) {
  if (event.type !== type) {
    throw new HTTPException(409, {
      message: "Idempotency key was already used for another command",
    });
  }
  for (const [key, value] of Object.entries(command)) {
    if (event.payload[key] !== value) {
      throw new HTTPException(409, {
        message: "Idempotency key was already used with different input",
      });
    }
  }
}

function transitionEventPolicyAction(type: string) {
  if (type === "incident.resolved") return "resolve" as const;
  if (type === "incident.dismissed") return "dismiss" as const;
  if (type === "incident.reopened") return "reopen" as const;
  return "transition" as const;
}

function assertIdempotentTransition(
  event: { type: string; payload: Record<string, unknown> },
  input: { to: IncidentStatus; resolutionSummary?: string },
) {
  const transitionTypes: RelayOpsOutboxPayload["type"][] = [
    "incident.status_changed",
    "incident.resolved",
    "incident.dismissed",
    "incident.reopened",
  ];
  if (!transitionTypes.includes(event.type as RelayOpsOutboxPayload["type"])) {
    throw new HTTPException(409, {
      message: "Idempotency key was already used for another command",
    });
  }
  assertIdempotentPayload(event, event.type as RelayOpsOutboxPayload["type"], {
    to: input.to,
    resolutionSummary: input.resolutionSummary?.trim() || null,
  });
}

export async function transitionIncident(
  c: Context,
  incidentId: string,
  input: BaseCommand & {
    to: IncidentStatus;
    resolutionSummary?: string;
  },
) {
  const workspaceId = c.get("workspaceId");
  const actorUserId = c.get("userId");
  const policy = await getPolicyIncident(workspaceId, incidentId);
  const priorCommand = await existingCommand(
    db,
    workspaceId,
    incidentId,
    input.idempotencyKey,
  );
  await requireIncidentPolicy(c, {
    action: priorCommand
      ? transitionEventPolicyAction(priorCommand.type)
      : transitionPolicyAction(policy.status, input.to),
    ownerTeamId: policy.ownerTeamId,
    currentSeverity: policy.severity,
  });

  return db.transaction(async (tx) => {
    const duplicate = await existingCommand(
      tx,
      workspaceId,
      incidentId,
      input.idempotencyKey,
    );
    if (duplicate) {
      assertIdempotentTransition(duplicate, input);
      return {
        kind: "success" as const,
        detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
      };
    }

    const current = await currentOrMissing(tx, workspaceId, incidentId);
    if (current.version !== input.expectedVersion) {
      return conflictResult(tx, workspaceId, incidentId);
    }

    const from = current.status as IncidentStatus;
    if (!isAllowedIncidentTransition(from, input.to)) {
      throw new HTTPException(422, {
        message: "Incident transition is not allowed",
      });
    }
    if (input.to === "resolved" && !input.resolutionSummary?.trim()) {
      throw new HTTPException(422, {
        message: "Resolution summary is required",
      });
    }

    const occurredAt = new Date();
    const timestamps = deriveIncidentTransitionTimestamps(
      from,
      input.to,
      {
        detectedAt: current.detectedAt,
        acknowledgedAt: current.acknowledgedAt,
        mitigatedAt: current.mitigatedAt,
        resolvedAt: current.resolvedAt,
        dismissedAt: current.dismissedAt,
      },
      occurredAt,
    );
    const eventType = incidentTransitionEventType(from, input.to);
    const version = current.version + 1;
    const [updated] = await tx
      .update(schema.incidentTable)
      .set({
        status: input.to,
        ...timestamps,
        resolutionSummary:
          input.to === "resolved" || input.to === "dismissed"
            ? input.resolutionSummary?.trim() || null
            : from === "resolved" || from === "dismissed"
              ? null
              : current.resolutionSummary,
        version,
        lastUpdateAt: occurredAt,
        updatedAt: occurredAt,
      })
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.id, incidentId),
          eq(schema.incidentTable.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.incidentTable.id });
    if (!updated) return conflictResult(tx, workspaceId, incidentId);

    const payload = {
      from,
      to: input.to,
      resolutionSummary: input.resolutionSummary?.trim() || null,
    };
    await tx.insert(schema.incidentEventTable).values({
      workspaceId,
      incidentId,
      incidentVersion: version,
      type: eventType,
      actorUserId,
      occurredAt,
      payload,
      idempotencyKey: input.idempotencyKey,
    });
    await tx.insert(schema.outboxEventTable).values({
      workspaceId,
      aggregateType: "incident",
      aggregateId: incidentId,
      aggregateVersion: version,
      eventType,
      payload: {
        actorUserId,
        workspaceId,
        incidentId,
        version,
        type: eventType,
      },
    });

    return {
      kind: "success" as const,
      detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
    };
  });
}

export async function changeIncidentSeverity(
  c: Context,
  incidentId: string,
  input: BaseCommand & { severity: IncidentSeverity },
) {
  const workspaceId = c.get("workspaceId");
  const actorUserId = c.get("userId");
  const policy = await getPolicyIncident(workspaceId, incidentId);
  await requireIncidentPolicy(c, {
    action: "severity",
    ownerTeamId: policy.ownerTeamId,
    currentSeverity: policy.severity,
    targetSeverity: input.severity,
  });

  return db.transaction(async (tx) => {
    const duplicate = await existingCommand(
      tx,
      workspaceId,
      incidentId,
      input.idempotencyKey,
    );
    if (duplicate) {
      assertIdempotentPayload(duplicate, "incident.severity_changed", {
        to: input.severity,
      });
      return {
        kind: "success" as const,
        detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
      };
    }
    const current = await currentOrMissing(tx, workspaceId, incidentId);
    if (current.version !== input.expectedVersion) {
      return conflictResult(tx, workspaceId, incidentId);
    }
    if (current.severity === input.severity) {
      throw new HTTPException(422, { message: "Severity is unchanged" });
    }

    const occurredAt = new Date();
    const version = current.version + 1;
    const [updated] = await tx
      .update(schema.incidentTable)
      .set({
        severity: input.severity,
        version,
        lastUpdateAt: occurredAt,
        updatedAt: occurredAt,
      })
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.id, incidentId),
          eq(schema.incidentTable.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.incidentTable.id });
    if (!updated) return conflictResult(tx, workspaceId, incidentId);

    const eventType = "incident.severity_changed" as const;
    await tx.insert(schema.incidentEventTable).values({
      workspaceId,
      incidentId,
      incidentVersion: version,
      type: eventType,
      actorUserId,
      occurredAt,
      payload: { from: current.severity, to: input.severity },
      idempotencyKey: input.idempotencyKey,
    });
    await tx.insert(schema.outboxEventTable).values({
      workspaceId,
      aggregateType: "incident",
      aggregateId: incidentId,
      aggregateVersion: version,
      eventType,
      payload: {
        actorUserId,
        workspaceId,
        incidentId,
        version,
        type: eventType,
      },
    });
    return {
      kind: "success" as const,
      detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
    };
  });
}

export async function publishIncidentUpdate(
  c: Context,
  incidentId: string,
  input: BaseCommand & { message: string },
) {
  const workspaceId = c.get("workspaceId");
  const actorUserId = c.get("userId");
  await getPolicyIncident(workspaceId, incidentId);
  await requireTimelineCapability(c, "publish");

  return db.transaction(async (tx) => {
    const duplicate = await existingCommand(
      tx,
      workspaceId,
      incidentId,
      input.idempotencyKey,
    );
    if (duplicate) {
      assertIdempotentPayload(duplicate, "incident.update_published", {
        message: input.message,
      });
      return {
        kind: "success" as const,
        detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
      };
    }
    const current = await currentOrMissing(tx, workspaceId, incidentId);
    if (current.version !== input.expectedVersion) {
      return conflictResult(tx, workspaceId, incidentId);
    }
    const occurredAt = new Date();
    const version = current.version + 1;
    const [updated] = await tx
      .update(schema.incidentTable)
      .set({ version, lastUpdateAt: occurredAt, updatedAt: occurredAt })
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.id, incidentId),
          eq(schema.incidentTable.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.incidentTable.id });
    if (!updated) return conflictResult(tx, workspaceId, incidentId);

    const eventType = "incident.update_published" as const;
    await tx.insert(schema.incidentEventTable).values({
      workspaceId,
      incidentId,
      incidentVersion: version,
      type: eventType,
      actorUserId,
      occurredAt,
      payload: { message: input.message },
      idempotencyKey: input.idempotencyKey,
    });
    await tx.insert(schema.outboxEventTable).values({
      workspaceId,
      aggregateType: "incident",
      aggregateId: incidentId,
      aggregateVersion: version,
      eventType,
      payload: {
        actorUserId,
        workspaceId,
        incidentId,
        version,
        type: eventType,
      },
    });
    return {
      kind: "success" as const,
      detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
    };
  });
}

export async function assignIncidentParticipants(
  c: Context,
  incidentId: string,
  input: BaseCommand & {
    commanderId?: string | null;
    responderIds?: string[];
    affectedServiceIds?: string[];
  },
) {
  const workspaceId = c.get("workspaceId");
  const actorUserId = c.get("userId");
  const policy = await getPolicyIncident(workspaceId, incidentId);
  if (input.commanderId !== undefined || input.responderIds !== undefined) {
    await requireIncidentPolicy(c, {
      action: "assign",
      ownerTeamId: policy.ownerTeamId,
      currentSeverity: policy.severity,
    });
  }
  if (input.affectedServiceIds !== undefined) {
    await requireIncidentPolicy(c, {
      action: "update",
      ownerTeamId: policy.ownerTeamId,
      currentSeverity: policy.severity,
    });
  }

  const responderIds = [...new Set(input.responderIds ?? [])].sort();
  const affectedServiceIds = [
    ...new Set(input.affectedServiceIds ?? []),
  ].sort();
  const participantIds = [
    ...new Set(
      [input.commanderId, ...responderIds].filter((value): value is string =>
        Boolean(value),
      ),
    ),
  ];
  if (participantIds.length > 0) {
    const members = await db
      .select({ userId: schema.workspaceUserTable.userId })
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspaceId),
          inArray(schema.workspaceUserTable.userId, participantIds),
        ),
      );
    if (
      new Set(members.map((member) => member.userId)).size !==
      participantIds.length
    ) {
      throw new HTTPException(422, {
        message: "Commander and responders must be workspace members",
      });
    }
  }
  if (affectedServiceIds.length > 0) {
    const services = await db
      .select({ id: schema.serviceTable.id })
      .from(schema.serviceTable)
      .where(
        and(
          eq(schema.serviceTable.workspaceId, workspaceId),
          inArray(schema.serviceTable.id, affectedServiceIds),
        ),
      );
    if (
      new Set(services.map((service) => service.id)).size !==
      affectedServiceIds.length
    ) {
      throw new HTTPException(422, {
        message: "Affected services must belong to the workspace",
      });
    }
  }

  const fingerprint = JSON.stringify({
    commanderId: input.commanderId,
    responderIds: input.responderIds === undefined ? undefined : responderIds,
    affectedServiceIds:
      input.affectedServiceIds === undefined ? undefined : affectedServiceIds,
  });
  return db.transaction(async (tx) => {
    const duplicate = await existingCommand(
      tx,
      workspaceId,
      incidentId,
      input.idempotencyKey,
    );
    if (duplicate) {
      assertIdempotentPayload(duplicate, "incident.assignment_changed", {
        fingerprint,
      });
      return {
        kind: "success" as const,
        detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
      };
    }
    const current = await currentOrMissing(tx, workspaceId, incidentId);
    if (current.version !== input.expectedVersion) {
      return conflictResult(tx, workspaceId, incidentId);
    }
    if (affectedServiceIds.includes(current.serviceId)) {
      throw new HTTPException(422, {
        message:
          "Primary service must not be duplicated as an affected service",
      });
    }

    const occurredAt = new Date();
    const version = current.version + 1;
    const [updated] = await tx
      .update(schema.incidentTable)
      .set({
        commanderId:
          input.commanderId === undefined
            ? current.commanderId
            : input.commanderId,
        version,
        lastUpdateAt: occurredAt,
        updatedAt: occurredAt,
      })
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.id, incidentId),
          eq(schema.incidentTable.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.incidentTable.id });
    if (!updated) return conflictResult(tx, workspaceId, incidentId);

    if (input.responderIds !== undefined) {
      await tx
        .delete(schema.incidentResponderTable)
        .where(
          and(
            eq(schema.incidentResponderTable.workspaceId, workspaceId),
            eq(schema.incidentResponderTable.incidentId, incidentId),
          ),
        );
      if (responderIds.length > 0) {
        await tx.insert(schema.incidentResponderTable).values(
          responderIds.map((userId) => ({
            workspaceId,
            incidentId,
            userId,
          })),
        );
      }
    }
    if (input.affectedServiceIds !== undefined) {
      await tx
        .delete(schema.incidentAffectedServiceTable)
        .where(
          and(
            eq(schema.incidentAffectedServiceTable.workspaceId, workspaceId),
            eq(schema.incidentAffectedServiceTable.incidentId, incidentId),
          ),
        );
      if (affectedServiceIds.length > 0) {
        await tx.insert(schema.incidentAffectedServiceTable).values(
          affectedServiceIds.map((serviceId) => ({
            workspaceId,
            incidentId,
            serviceId,
          })),
        );
      }
    }

    const eventType = "incident.assignment_changed" as const;
    await tx.insert(schema.incidentEventTable).values({
      workspaceId,
      incidentId,
      incidentVersion: version,
      type: eventType,
      actorUserId,
      occurredAt,
      payload: {
        fingerprint,
        commanderId:
          input.commanderId === undefined
            ? current.commanderId
            : input.commanderId,
        responderIds,
        affectedServiceIds,
      },
      idempotencyKey: input.idempotencyKey,
    });
    await tx.insert(schema.outboxEventTable).values({
      workspaceId,
      aggregateType: "incident",
      aggregateId: incidentId,
      aggregateVersion: version,
      eventType,
      payload: {
        actorUserId,
        workspaceId,
        incidentId,
        version,
        type: eventType,
      },
    });
    return {
      kind: "success" as const,
      detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
    };
  });
}

type TimestampCorrectionInput = BaseCommand & {
  reason: string;
  detectedAt?: string;
  acknowledgedAt?: string | null;
  mitigatedAt?: string | null;
  resolvedAt?: string | null;
  dismissedAt?: string | null;
};

export async function correctIncidentTimestamps(
  c: Context,
  incidentId: string,
  input: TimestampCorrectionInput,
) {
  const workspaceId = c.get("workspaceId");
  const actorUserId = c.get("userId");
  await getPolicyIncident(workspaceId, incidentId);
  await requireTimelineCapability(c, "correct");

  return db.transaction(async (tx) => {
    const duplicate = await existingCommand(
      tx,
      workspaceId,
      incidentId,
      input.idempotencyKey,
    );
    if (duplicate) {
      assertIdempotentPayload(duplicate, "incident.timestamps_corrected", {
        reason: input.reason,
      });
      return {
        kind: "success" as const,
        detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
      };
    }
    const current = await currentOrMissing(tx, workspaceId, incidentId);
    if (current.version !== input.expectedVersion) {
      return conflictResult(tx, workspaceId, incidentId);
    }

    const corrected = {
      detectedAt:
        input.detectedAt === undefined
          ? current.detectedAt
          : new Date(input.detectedAt),
      acknowledgedAt:
        input.acknowledgedAt === undefined
          ? current.acknowledgedAt
          : input.acknowledgedAt === null
            ? null
            : new Date(input.acknowledgedAt),
      mitigatedAt:
        input.mitigatedAt === undefined
          ? current.mitigatedAt
          : input.mitigatedAt === null
            ? null
            : new Date(input.mitigatedAt),
      resolvedAt:
        input.resolvedAt === undefined
          ? current.resolvedAt
          : input.resolvedAt === null
            ? null
            : new Date(input.resolvedAt),
      dismissedAt:
        input.dismissedAt === undefined
          ? current.dismissedAt
          : input.dismissedAt === null
            ? null
            : new Date(input.dismissedAt),
    };
    if (
      !validateIncidentTimestamps(current.status as IncidentStatus, corrected)
    ) {
      throw new HTTPException(422, {
        message: "Corrected timestamps violate lifecycle invariants",
      });
    }

    const occurredAt = new Date();
    const version = current.version + 1;
    const [updated] = await tx
      .update(schema.incidentTable)
      .set({
        ...corrected,
        version,
        lastUpdateAt: occurredAt,
        updatedAt: occurredAt,
      })
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.id, incidentId),
          eq(schema.incidentTable.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.incidentTable.id });
    if (!updated) return conflictResult(tx, workspaceId, incidentId);

    const eventType = "incident.timestamps_corrected" as const;
    const before = {
      detectedAt: current.detectedAt.toISOString(),
      acknowledgedAt: current.acknowledgedAt?.toISOString() ?? null,
      mitigatedAt: current.mitigatedAt?.toISOString() ?? null,
      resolvedAt: current.resolvedAt?.toISOString() ?? null,
      dismissedAt: current.dismissedAt?.toISOString() ?? null,
    };
    const after = {
      detectedAt: corrected.detectedAt.toISOString(),
      acknowledgedAt: corrected.acknowledgedAt?.toISOString() ?? null,
      mitigatedAt: corrected.mitigatedAt?.toISOString() ?? null,
      resolvedAt: corrected.resolvedAt?.toISOString() ?? null,
      dismissedAt: corrected.dismissedAt?.toISOString() ?? null,
    };
    await tx.insert(schema.incidentEventTable).values({
      workspaceId,
      incidentId,
      incidentVersion: version,
      type: eventType,
      actorUserId,
      occurredAt,
      payload: { reason: input.reason, before, after },
      idempotencyKey: input.idempotencyKey,
    });
    await tx.insert(schema.outboxEventTable).values({
      workspaceId,
      aggregateType: "incident",
      aggregateId: incidentId,
      aggregateVersion: version,
      eventType,
      payload: {
        actorUserId,
        workspaceId,
        incidentId,
        version,
        type: eventType,
      },
    });
    return {
      kind: "success" as const,
      detail: await getIncidentDetailFrom(tx, workspaceId, incidentId),
    };
  });
}

type TimelineCursor = {
  workspaceId: string;
  incidentId: string;
  occurredAt: string;
  id: string;
};

function encodeTimelineCursor(cursor: TimelineCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeTimelineCursor(
  value: string,
  workspaceId: string,
  incidentId: string,
) {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<TimelineCursor>;
    if (
      decoded.workspaceId !== workspaceId ||
      decoded.incidentId !== incidentId ||
      typeof decoded.occurredAt !== "string" ||
      typeof decoded.id !== "string"
    ) {
      throw new Error("scope mismatch");
    }
    const occurredAt = new Date(decoded.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new Error("invalid time");
    return { occurredAt, id: decoded.id };
  } catch {
    throw new HTTPException(400, { message: "Invalid timeline cursor" });
  }
}

export async function listIncidentTimeline(
  workspaceId: string,
  incidentId: string,
  query: { cursor?: string; limit: number },
) {
  await currentOrMissing(db, workspaceId, incidentId);
  const cursor = query.cursor
    ? decodeTimelineCursor(query.cursor, workspaceId, incidentId)
    : null;
  const rows = await db
    .select()
    .from(schema.incidentEventTable)
    .where(
      and(
        eq(schema.incidentEventTable.workspaceId, workspaceId),
        eq(schema.incidentEventTable.incidentId, incidentId),
        cursor
          ? or(
              lt(schema.incidentEventTable.occurredAt, cursor.occurredAt),
              and(
                eq(schema.incidentEventTable.occurredAt, cursor.occurredAt),
                lt(schema.incidentEventTable.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(
      desc(schema.incidentEventTable.occurredAt),
      desc(schema.incidentEventTable.id),
    )
    .limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map((event) => ({
    ...event,
    type: event.type as RelayOpsOutboxPayload["type"],
  }));
  const tail = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && tail
        ? encodeTimelineCursor({
            workspaceId,
            incidentId,
            occurredAt: tail.occurredAt.toISOString(),
            id: tail.id,
          })
        : null,
  };
}
