import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import {
  incidentImpacts,
  incidentSeverities,
  incidentStatuses,
} from "./lifecycle";
import {
  workbenchColumnIds,
  workbenchGroups,
  workbenchSortFields,
} from "./workbench-schema";

export const workbenchSortResponseSchema = z.object({
  field: z.enum(workbenchSortFields),
  direction: z.enum(["asc", "desc"]),
});

export const workbenchDefinitionResponseSchema = z.object({
  q: z.string(),
  status: z.array(z.enum(incidentStatuses)),
  severity: z.array(z.enum(incidentSeverities)),
  service: z.array(z.string()),
  commander: z.array(z.string()),
  from: z.string(),
  to: z.string(),
  sort: z.array(workbenchSortResponseSchema),
  group: z.enum(workbenchGroups),
  density: z.enum(["compact", "comfortable"]),
  columns: z.array(
    z.object({
      id: z.enum(workbenchColumnIds),
      pin: z.enum(["left", "right"]).nullable(),
      width: z.number().int().min(80).max(640),
    }),
  ),
});

export const incidentWorkbenchItemSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    status: z.enum(incidentStatuses),
    severity: z.enum(incidentSeverities),
    impact: z.enum(incidentImpacts),
    version: z.number().int().positive(),
    detectedAt: responseTimestamp,
    resolvedAt: nullableResponseTimestamp,
    lastUpdateAt: responseTimestamp,
    service: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
    affectedServices: z.array(
      z.object({ id: z.string(), name: z.string(), slug: z.string() }),
    ),
    commander: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .nullable(),
    responders: z.array(z.object({ id: z.string(), name: z.string() })),
  })
  .openapi("RelayOpsIncidentWorkbenchItem");

const facetValueSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const incidentWorkbenchPageSchema = z
  .object({
    items: z.array(incidentWorkbenchItemSchema),
    nextCursor: z.string().nullable(),
    facets: z.object({
      status: z.array(facetValueSchema),
      severity: z.array(facetValueSchema),
      service: z.array(facetValueSchema),
      commander: z.array(facetValueSchema),
    }),
    groups: z.array(facetValueSchema),
  })
  .openapi("RelayOpsIncidentWorkbenchPage");

export const savedViewSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    ownerUserId: z.string(),
    schemaVersion: z.literal(1),
    name: z.string(),
    visibility: z.enum(["private", "workspace"]),
    definition: workbenchDefinitionResponseSchema,
    version: z.number().int().positive(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("RelayOpsSavedView");

export const savedViewListSchema = z
  .array(savedViewSchema)
  .openapi("RelayOpsSavedViewList");

export const savedViewVersionConflictSchema = z
  .object({
    code: z.literal("saved_view_version_conflict"),
    message: z.string(),
    current: savedViewSchema,
  })
  .openapi("RelayOpsSavedViewVersionConflict");

export const savedViewDeleteSchema = z
  .object({
    deleted: z.literal(true),
    id: z.string(),
    deletedAt: nullableResponseTimestamp,
  })
  .openapi("RelayOpsSavedViewDelete");
