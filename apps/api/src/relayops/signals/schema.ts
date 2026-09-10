import { nullableResponseTimestamp, responseTimestamp, z } from "../../openapi";
import { SIGNAL_SEVERITIES } from "./normalization";

export const signalSeveritySchema = z.enum(SIGNAL_SEVERITIES);

export const signalSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    source: z.string(),
    externalId: z.string().nullable(),
    fingerprint: z.string(),
    deduplicationKey: z.string(),
    serviceId: z.string().nullable(),
    title: z.string(),
    summary: z.string().nullable(),
    observedAt: responseTimestamp,
    severityHint: signalSeveritySchema,
    redactedPayload: z.record(z.string(), z.unknown()),
    ingestionStatus: z.enum(["new", "attached"]),
    isDemo: z.boolean(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("RelayOpsSignal");

export const signalCreateResultSchema = z
  .object({
    signal: signalSchema,
    deduplicated: z.boolean(),
  })
  .openapi("RelayOpsSignalCreateResult");

export const signalSourceSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    source: z.literal("generic_webhook"),
    enabled: z.boolean(),
    webhookPath: z.string(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("RelayOpsSignalSource");

export const signalSourceSecretSchema = signalSourceSchema
  .extend({ secret: z.string() })
  .openapi("RelayOpsSignalSourceSecret");

export const signalAttachmentSchema = z
  .object({
    incidentId: z.string(),
    signal: signalSchema,
    attached: z.boolean(),
    incidentVersion: z.number().int().positive(),
  })
  .openapi("RelayOpsSignalAttachment");

export const signalAttachmentConflictSchema = z
  .object({
    code: z.literal("version_conflict"),
    currentVersion: z.number().int().positive(),
  })
  .openapi("RelayOpsSignalAttachmentConflict");

export const webhookIngestionResultSchema = z
  .object({
    accepted: z.literal(true),
    deduplicated: z.boolean(),
    signalId: z.string(),
  })
  .openapi("RelayOpsWebhookIngestionResult");

export const workspaceParam = z.object({ workspaceId: z.string().min(1) });
export const signalParam = workspaceParam.extend({ id: z.string().min(1) });
export const signalSourceParam = workspaceParam.extend({
  sourceId: z.string().min(1),
});
export const signalAttachmentParam = workspaceParam.extend({
  incidentId: z.string().min(1),
  signalId: z.string().min(1),
});
export const webhookSourceParam = z.object({ sourceId: z.string().min(1) });

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional();

export const manualSignalBody = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  externalId: optionalText(200),
  serviceId: optionalText(128),
  title: z.string().trim().min(1).max(200),
  summary: optionalText(2_000),
  observedAt: z.iso.datetime({ offset: true }).optional(),
  severityHint: signalSeveritySchema.default("unknown"),
  deduplicationKey: optionalText(200),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const demoSignalBody = z.object({ serviceId: z.string().min(1) });

export const createSignalSourceBody = z.object({
  name: z.string().trim().min(1).max(120),
});

export const attachSignalBody = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const listSignalsQuery = z.object({
  status: z.enum(["new", "attached", "all"]).default("all"),
  serviceId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const signalIngestionAttemptSchema = z
  .object({
    requestId: z.string(),
    receivedAt: responseTimestamp,
    completedAt: nullableResponseTimestamp,
  })
  .openapi("RelayOpsSignalIngestionAttemptReference");
