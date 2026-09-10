import { z } from "../openapi";
import {
  incidentImpacts,
  incidentSeverities,
  incidentStatuses,
} from "./lifecycle";

export const workspaceParam = z.object({
  workspaceId: z.string().min(1),
});

export const workspaceResourceParam = workspaceParam.extend({
  id: z.string().min(1),
});

export const createServiceBody = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).optional(),
  tier: z.enum(["critical", "high", "standard", "low"]).default("standard"),
  health: z
    .enum(["operational", "degraded", "major_outage", "maintenance"])
    .default("operational"),
  ownerTeamId: z.string().min(1).nullable().optional(),
  repositoryUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .nullable()
    .optional(),
  runbookUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .nullable()
    .optional(),
});

export const updateServiceBody = createServiceBody
  .partial()
  .extend({
    tier: z.enum(["critical", "high", "standard", "low"]).optional(),
    health: z
      .enum(["operational", "degraded", "major_outage", "maintenance"])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one service field is required",
  });

export const listServicesQuery = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived", "all"]).default("active"),
});

export const createDemoDataBody = z.object({
  serviceId: z.string().min(1),
});

export const createIncidentBody = z.object({
  serviceId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  severity: z.enum(incidentSeverities).default("unknown"),
  impact: z.enum(incidentImpacts).default("unknown"),
  idempotencyKey: z.string().trim().min(8).max(128),
});

const incidentCommandBase = {
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
};

export const transitionIncidentBody = z
  .object({
    ...incidentCommandBase,
    to: z.enum(incidentStatuses),
    resolutionSummary: z.string().trim().min(1).max(5000).optional(),
  })
  .refine(
    (value) => value.to !== "resolved" || Boolean(value.resolutionSummary),
    {
      message: "Resolution summary is required when resolving an incident",
      path: ["resolutionSummary"],
    },
  );

export const changeIncidentSeverityBody = z.object({
  ...incidentCommandBase,
  severity: z.enum(incidentSeverities),
});

export const assignIncidentParticipantsBody = z
  .object({
    ...incidentCommandBase,
    commanderId: z.string().min(1).nullable().optional(),
    responderIds: z.array(z.string().min(1)).max(100).optional(),
    affectedServiceIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine(
    (value) =>
      value.commanderId !== undefined ||
      value.responderIds !== undefined ||
      value.affectedServiceIds !== undefined,
    {
      message: "At least one participant or affected-service field is required",
    },
  );

export const publishIncidentUpdateBody = z.object({
  ...incidentCommandBase,
  message: z.string().trim().min(1).max(5000),
});

const correctionTimestamp = z.string().datetime({ offset: true });

export const correctIncidentTimestampsBody = z
  .object({
    ...incidentCommandBase,
    reason: z.string().trim().min(1).max(500),
    detectedAt: correctionTimestamp.optional(),
    acknowledgedAt: correctionTimestamp.nullable().optional(),
    mitigatedAt: correctionTimestamp.nullable().optional(),
    resolvedAt: correctionTimestamp.nullable().optional(),
    dismissedAt: correctionTimestamp.nullable().optional(),
  })
  .refine(
    (value) =>
      [
        value.detectedAt,
        value.acknowledgedAt,
        value.mitigatedAt,
        value.resolvedAt,
        value.dismissedAt,
      ].some((timestamp) => timestamp !== undefined),
    { message: "At least one corrected timestamp is required" },
  );

export const incidentTimelineQuery = z.object({
  cursor: z.string().trim().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
