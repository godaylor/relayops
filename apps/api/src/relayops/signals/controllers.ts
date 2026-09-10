import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
} from "./crypto";
import {
  type NormalizedSignal,
  normalizeSignal,
  SignalNormalizationError,
} from "./normalization";

const DEMO_DATA_SET_ID = "relayops-onboarding-v1";

type SignalListQuery = {
  status: "new" | "attached" | "all";
  serviceId?: string;
  limit: number;
};

type IngestionAttemptOutcome =
  | "received"
  | "accepted"
  | "deduplicated"
  | "rejected"
  | "rate_limited";

function databaseConstraint(error: unknown) {
  const candidate = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  return {
    code: candidate.code ?? candidate.cause?.code,
    constraint: candidate.constraint ?? candidate.cause?.constraint ?? "",
  };
}

function presentSignal<
  T extends {
    severityHint: string;
    ingestionStatus: string;
    demoDataSetId?: string | null;
  },
>(row: T) {
  const { demoDataSetId, ...signal } = row;
  return {
    ...signal,
    severityHint: row.severityHint as
      | "unknown"
      | "sev1"
      | "sev2"
      | "sev3"
      | "sev4",
    ingestionStatus: row.ingestionStatus as "new" | "attached",
    isDemo: Boolean(demoDataSetId),
  };
}

function presentSource<
  T extends {
    id: string;
    source: string;
    encryptedSecret: string;
    nonce: string;
    keyVersion: number;
  },
>(row: T) {
  const {
    encryptedSecret: _encryptedSecret,
    nonce: _nonce,
    keyVersion: _keyVersion,
    ...safe
  } = row;
  return {
    ...safe,
    source: "generic_webhook" as const,
    webhookPath: `/api/webhooks/${row.id}/signals`,
  };
}

async function assertService(workspaceId: string, serviceId: string | null) {
  if (!serviceId) return;
  const [service] = await db
    .select({ id: schema.serviceTable.id })
    .from(schema.serviceTable)
    .where(
      and(
        eq(schema.serviceTable.workspaceId, workspaceId),
        eq(schema.serviceTable.id, serviceId),
        isNull(schema.serviceTable.archivedAt),
      ),
    )
    .limit(1);
  if (!service) {
    throw new HTTPException(404, {
      message: "Active service not found in this workspace",
    });
  }
}

async function insertNormalizedSignal({
  workspaceId,
  normalized,
  demoDataSetId = null,
}: {
  workspaceId: string;
  normalized: NormalizedSignal;
  demoDataSetId?: string | null;
}) {
  await assertService(workspaceId, normalized.serviceId);
  const [created] = await db
    .insert(schema.signalTable)
    .values({
      workspaceId,
      source: normalized.source,
      externalId: normalized.externalId,
      fingerprint: normalized.fingerprint,
      deduplicationKey: normalized.deduplicationKey,
      serviceId: normalized.serviceId,
      title: normalized.title,
      summary: normalized.summary,
      observedAt: normalized.observedAt,
      severityHint: normalized.severityHint,
      redactedPayload: normalized.redactedPayload,
      ingestionStatus: "new",
      demoDataSetId,
    })
    .onConflictDoNothing()
    .returning();
  if (created) {
    return { signal: presentSignal(created), deduplicated: false };
  }

  if (normalized.externalId) {
    const [duplicate] = await db
      .select()
      .from(schema.signalTable)
      .where(
        and(
          eq(schema.signalTable.workspaceId, workspaceId),
          eq(schema.signalTable.source, normalized.source),
          eq(schema.signalTable.externalId, normalized.externalId),
        ),
      )
      .limit(1);
    if (duplicate) {
      return { signal: presentSignal(duplicate), deduplicated: true };
    }
  }
  throw new HTTPException(409, {
    message: "Signal conflicts with an existing ingestion record",
  });
}

export async function createManualSignal(
  workspaceId: string,
  input: {
    idempotencyKey: string;
    externalId?: string;
    serviceId?: string;
    title: string;
    summary?: string;
    observedAt?: string;
    severityHint: "unknown" | "sev1" | "sev2" | "sev3" | "sev4";
    deduplicationKey?: string;
    payload?: Record<string, unknown>;
  },
) {
  const normalized = normalizeSignal(
    {
      ...input,
      externalId: input.externalId ?? `manual:${input.idempotencyKey}`,
    },
    { source: "manual" },
  );
  return insertNormalizedSignal({ workspaceId, normalized });
}

export async function createDemoSignal(workspaceId: string, serviceId: string) {
  const normalized = normalizeSignal(
    {
      externalId: `demo:degraded-latency:${serviceId}:v1`,
      deduplicationKey: `demo:degraded-latency:${serviceId}:v1`,
      serviceId,
      title: "Checkout latency above SLO",
      summary: "Deterministic demo signal for the incident response journey.",
      observedAt: "2026-01-15T09:30:00.000Z",
      severityHint: "sev2",
      payload: {
        metric: "http.server.duration.p95",
        value: 1_240,
        unit: "ms",
        threshold: 750,
        environment: "demo",
        region: "eu-central",
      },
    },
    { source: "demo" },
  );
  return insertNormalizedSignal({
    workspaceId,
    normalized,
    demoDataSetId: DEMO_DATA_SET_ID,
  });
}

export async function listSignals(workspaceId: string, query: SignalListQuery) {
  const rows = await db
    .select()
    .from(schema.signalTable)
    .where(
      and(
        eq(schema.signalTable.workspaceId, workspaceId),
        query.status === "all"
          ? undefined
          : eq(schema.signalTable.ingestionStatus, query.status),
        query.serviceId
          ? eq(schema.signalTable.serviceId, query.serviceId)
          : undefined,
      ),
    )
    .orderBy(desc(schema.signalTable.observedAt), desc(schema.signalTable.id))
    .limit(query.limit);
  return rows.map(presentSignal);
}

export async function getSignal(workspaceId: string, signalId: string) {
  const [signal] = await db
    .select()
    .from(schema.signalTable)
    .where(
      and(
        eq(schema.signalTable.workspaceId, workspaceId),
        eq(schema.signalTable.id, signalId),
      ),
    )
    .limit(1);
  if (!signal) {
    throw new HTTPException(404, { message: "Signal not found" });
  }
  return presentSignal(signal);
}

export async function listSignalSources(workspaceId: string) {
  const rows = await db
    .select()
    .from(schema.signalSourceTable)
    .where(eq(schema.signalSourceTable.workspaceId, workspaceId))
    .orderBy(desc(schema.signalSourceTable.createdAt));
  return rows.map(presentSource);
}

export async function createSignalSource(workspaceId: string, name: string) {
  const id = createId();
  const secret = generateWebhookSecret();
  const envelope = encryptWebhookSecret({
    workspaceId,
    sourceId: id,
    secret,
  });
  try {
    const [created] = await db
      .insert(schema.signalSourceTable)
      .values({
        id,
        workspaceId,
        name,
        source: "generic_webhook",
        ...envelope,
        enabled: true,
      })
      .returning();
    if (!created) {
      throw new HTTPException(500, {
        message: "Signal source was not created",
      });
    }
    return { ...presentSource(created), secret };
  } catch (error) {
    const constraint = databaseConstraint(error);
    if (constraint.code === "23505") {
      throw new HTTPException(409, {
        message: "A signal source with this name already exists",
      });
    }
    throw error;
  }
}

export async function rotateSignalSourceSecret(
  workspaceId: string,
  sourceId: string,
) {
  const [source] = await db
    .select()
    .from(schema.signalSourceTable)
    .where(
      and(
        eq(schema.signalSourceTable.workspaceId, workspaceId),
        eq(schema.signalSourceTable.id, sourceId),
      ),
    )
    .limit(1);
  if (!source) {
    throw new HTTPException(404, { message: "Signal source not found" });
  }
  const secret = generateWebhookSecret();
  const envelope = encryptWebhookSecret({ workspaceId, sourceId, secret });
  const [updated] = await db
    .update(schema.signalSourceTable)
    .set({ ...envelope, updatedAt: new Date() })
    .where(
      and(
        eq(schema.signalSourceTable.workspaceId, workspaceId),
        eq(schema.signalSourceTable.id, sourceId),
      ),
    )
    .returning();
  if (!updated) {
    throw new HTTPException(404, { message: "Signal source not found" });
  }
  return { ...presentSource(updated), secret };
}

export async function getEnabledWebhookSource(sourceId: string) {
  const [source] = await db
    .select()
    .from(schema.signalSourceTable)
    .where(
      and(
        eq(schema.signalSourceTable.id, sourceId),
        eq(schema.signalSourceTable.source, "generic_webhook"),
        eq(schema.signalSourceTable.enabled, true),
      ),
    )
    .limit(1);
  if (!source) {
    throw new HTTPException(404, { message: "Webhook source not found" });
  }
  return source;
}

export function decryptSignalSourceSecret(source: {
  id: string;
  workspaceId: string;
  encryptedSecret: string;
  nonce: string;
  keyVersion: number;
}) {
  return decryptWebhookSecret({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    envelope: {
      encryptedSecret: source.encryptedSecret,
      nonce: source.nonce,
      keyVersion: source.keyVersion,
    },
  });
}

export async function createWebhookSignal(
  source: { id: string; workspaceId: string },
  payload: unknown,
) {
  const sourceKey = `webhook:${source.id}`;
  const normalized = normalizeSignal(payload, { source: sourceKey });
  if (!normalized.externalId) {
    throw new SignalNormalizationError(
      "missing_external_id",
      "externalId is required for webhook ingestion",
    );
  }
  return insertNormalizedSignal({
    workspaceId: source.workspaceId,
    normalized,
  });
}

export async function reserveWebhookAttempt({
  source,
  requestId,
  now,
  rateLimit,
  rateWindowSeconds,
}: {
  source: { id: string; workspaceId: string };
  requestId: string;
  now: Date;
  rateLimit: number;
  rateWindowSeconds: number;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${source.id}, 0))`,
    );
    const [existing] = await tx
      .select({ id: schema.signalIngestionAttemptTable.id })
      .from(schema.signalIngestionAttemptTable)
      .where(
        and(
          eq(
            schema.signalIngestionAttemptTable.workspaceId,
            source.workspaceId,
          ),
          eq(schema.signalIngestionAttemptTable.sourceId, source.id),
          eq(schema.signalIngestionAttemptTable.requestId, requestId),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        limited: false as const,
        replayed: true as const,
        attemptId: existing.id,
      };
    }
    const since = new Date(now.getTime() - rateWindowSeconds * 1_000);
    const [rate] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.signalIngestionAttemptTable)
      .where(
        and(
          eq(
            schema.signalIngestionAttemptTable.workspaceId,
            source.workspaceId,
          ),
          eq(schema.signalIngestionAttemptTable.sourceId, source.id),
          gte(schema.signalIngestionAttemptTable.receivedAt, since),
        ),
      );
    if ((rate?.value ?? 0) >= rateLimit) {
      return {
        limited: true as const,
        replayed: false as const,
        attemptId: null,
      };
    }
    const [attempt] = await tx
      .insert(schema.signalIngestionAttemptTable)
      .values({
        workspaceId: source.workspaceId,
        sourceId: source.id,
        requestId,
        payloadHash: null,
        bodySize: 0,
        outcome: "received",
        errorCode: null,
        receivedAt: now,
        completedAt: null,
      })
      .returning({ id: schema.signalIngestionAttemptTable.id });
    if (!attempt) {
      throw new HTTPException(500, {
        message: "Webhook attempt could not be reserved",
      });
    }
    return {
      limited: false as const,
      replayed: false as const,
      attemptId: attempt.id,
    };
  });
}

export async function completeWebhookAttempt({
  workspaceId,
  attemptId,
  outcome,
  errorCode,
  rawBody,
  completedAt = new Date(),
}: {
  workspaceId: string;
  attemptId: string;
  outcome: Exclude<IngestionAttemptOutcome, "received" | "rate_limited">;
  errorCode: string | null;
  rawBody?: Uint8Array;
  completedAt?: Date;
}) {
  const payloadHash = rawBody
    ? createHash("sha256").update(rawBody).digest("hex")
    : null;
  await db
    .update(schema.signalIngestionAttemptTable)
    .set({
      payloadHash,
      bodySize: rawBody?.byteLength ?? 0,
      outcome,
      errorCode,
      completedAt,
    })
    .where(
      and(
        eq(schema.signalIngestionAttemptTable.workspaceId, workspaceId),
        eq(schema.signalIngestionAttemptTable.id, attemptId),
      ),
    );
  return { payloadHash, bodySize: rawBody?.byteLength ?? 0 };
}

export async function attachSignal({
  workspaceId,
  incidentId,
  signalId,
  actorUserId,
  expectedVersion,
  idempotencyKey,
}: {
  workspaceId: string;
  incidentId: string;
  signalId: string;
  actorUserId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  await getSignal(workspaceId, signalId);
  const outcome = await db.transaction(async (tx) => {
    const [incident] = await tx
      .select({
        id: schema.incidentTable.id,
        version: schema.incidentTable.version,
      })
      .from(schema.incidentTable)
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.id, incidentId),
        ),
      )
      .limit(1);
    if (!incident) {
      throw new HTTPException(404, { message: "Incident not found" });
    }

    const [duplicateCommand] = await tx
      .select({ payload: schema.incidentEventTable.payload })
      .from(schema.incidentEventTable)
      .where(
        and(
          eq(schema.incidentEventTable.workspaceId, workspaceId),
          eq(schema.incidentEventTable.incidentId, incidentId),
          eq(schema.incidentEventTable.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (duplicateCommand) {
      if (duplicateCommand.payload.signalId !== signalId) {
        throw new HTTPException(409, {
          message: "Idempotency key was reused with another signal",
        });
      }
      return { attached: false, incidentVersion: incident.version };
    }

    const [existingAttachment] = await tx
      .select({ signalId: schema.incidentSignalTable.signalId })
      .from(schema.incidentSignalTable)
      .where(
        and(
          eq(schema.incidentSignalTable.workspaceId, workspaceId),
          eq(schema.incidentSignalTable.incidentId, incidentId),
          eq(schema.incidentSignalTable.signalId, signalId),
        ),
      )
      .limit(1);
    if (existingAttachment) {
      return { attached: false, incidentVersion: incident.version };
    }
    if (incident.version !== expectedVersion) {
      return {
        attached: null,
        conflict: true as const,
        incidentVersion: incident.version,
      };
    }

    const occurredAt = new Date();
    const version = incident.version + 1;
    const [updated] = await tx
      .update(schema.incidentTable)
      .set({ version, lastUpdateAt: occurredAt, updatedAt: occurredAt })
      .where(
        and(
          eq(schema.incidentTable.workspaceId, workspaceId),
          eq(schema.incidentTable.id, incidentId),
          eq(schema.incidentTable.version, expectedVersion),
        ),
      )
      .returning({ id: schema.incidentTable.id });
    if (!updated) {
      const [current] = await tx
        .select({ version: schema.incidentTable.version })
        .from(schema.incidentTable)
        .where(
          and(
            eq(schema.incidentTable.workspaceId, workspaceId),
            eq(schema.incidentTable.id, incidentId),
          ),
        );
      return {
        attached: null,
        conflict: true as const,
        incidentVersion: current?.version ?? expectedVersion,
      };
    }

    await tx.insert(schema.incidentSignalTable).values({
      workspaceId,
      incidentId,
      signalId,
      attachedBy: actorUserId,
      attachedAt: occurredAt,
    });
    await tx
      .update(schema.signalTable)
      .set({ ingestionStatus: "attached", updatedAt: occurredAt })
      .where(
        and(
          eq(schema.signalTable.workspaceId, workspaceId),
          eq(schema.signalTable.id, signalId),
        ),
      );
    const eventType = "incident.signal_attached" as const;
    await tx.insert(schema.incidentEventTable).values({
      workspaceId,
      incidentId,
      incidentVersion: version,
      type: eventType,
      actorUserId,
      occurredAt,
      payload: { signalId },
      idempotencyKey,
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
    return { attached: true, incidentVersion: version };
  });

  if ("conflict" in outcome && outcome.conflict) {
    return {
      kind: "conflict" as const,
      currentVersion: outcome.incidentVersion,
    };
  }
  return {
    kind: "success" as const,
    incidentId,
    signal: await getSignal(workspaceId, signalId),
    attached: outcome.attached,
    incidentVersion: outcome.incidentVersion,
  };
}
