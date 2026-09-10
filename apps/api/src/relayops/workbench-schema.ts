import { z } from "../openapi";
import { incidentSeverities, incidentStatuses } from "./lifecycle";

export const workbenchSortFields = [
  "severity",
  "status",
  "detectedAt",
  "lastUpdateAt",
  "title",
  "service",
  "commander",
] as const;

export const workbenchGroups = [
  "none",
  "status",
  "severity",
  "service",
  "commander",
] as const;

export const workbenchColumnIds = [
  "key",
  "title",
  "status",
  "severity",
  "impact",
  "service",
  "affectedServices",
  "commander",
  "responders",
  "detectedAt",
  "elapsed",
  "lastUpdateAt",
] as const;

const idSchema = z.string().trim().min(1).max(128);

function csvArray<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      const values = Array.isArray(value) ? value : [value];
      return values.flatMap((entry) =>
        typeof entry === "string" ? entry.split(",") : [],
      );
    },
    z
      .array(item)
      .max(100)
      .transform((items) => [...new Set(items)].sort()),
  );
}

const workbenchSortSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    return (Array.isArray(value) ? value : [value]).flatMap((entry) =>
      typeof entry === "string" ? entry.split(",") : [],
    );
  },
  z
    .array(
      z
        .string()
        .trim()
        .regex(
          /^-?(severity|status|detectedAt|lastUpdateAt|title|service|commander)$/,
        ),
    )
    .min(1)
    .max(3)
    .transform((items) => {
      const seen = new Set<string>();
      return items.flatMap((item) => {
        const direction = item.startsWith("-") ? "desc" : "asc";
        const field = item.startsWith("-") ? item.slice(1) : item;
        if (seen.has(field)) return [];
        seen.add(field);
        return [
          {
            field: field as (typeof workbenchSortFields)[number],
            direction: direction as "asc" | "desc",
          },
        ];
      });
    }),
);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));

export const incidentWorkbenchQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: csvArray(z.enum(incidentStatuses)).optional(),
    severity: csvArray(z.enum(incidentSeverities)).optional(),
    service: csvArray(idSchema).optional(),
    commander: csvArray(idSchema).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    sort: workbenchSortSchema.optional(),
    group: z.enum(workbenchGroups).default("none"),
    cursor: z.string().trim().min(1).max(4096).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must not be after to",
    path: ["from"],
  });

export type IncidentWorkbenchQuery = z.infer<typeof incidentWorkbenchQuery>;

export const workbenchDefinitionSchema = z.object({
  q: z.string().trim().max(200).default(""),
  status: z.array(z.enum(incidentStatuses)).max(6),
  severity: z.array(z.enum(incidentSeverities)).max(5),
  service: z.array(idSchema).max(100),
  commander: z.array(idSchema).max(100),
  from: dateSchema,
  to: dateSchema,
  sort: z
    .array(
      z.object({
        field: z.enum(workbenchSortFields),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .min(1)
    .max(3),
  group: z.enum(workbenchGroups),
  density: z.enum(["compact", "comfortable"]),
  columns: z
    .array(
      z.object({
        id: z.enum(workbenchColumnIds),
        pin: z.enum(["left", "right"]).nullable(),
        width: z.number().int().min(80).max(640),
      }),
    )
    .min(1)
    .max(12),
});

export type WorkbenchDefinition = z.infer<typeof workbenchDefinitionSchema>;

export const createSavedViewBody = z.object({
  name: z.string().trim().min(1).max(120),
  visibility: z.enum(["private", "workspace"]).default("private"),
  definition: workbenchDefinitionSchema,
});

export const updateSavedViewBody = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(120).optional(),
    visibility: z.enum(["private", "workspace"]).optional(),
    definition: workbenchDefinitionSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.visibility !== undefined ||
      value.definition !== undefined,
    { message: "At least one saved-view field is required" },
  );

export const deleteSavedViewQuery = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});
