import { z } from "../openapi";
import { incidentSeverities, incidentStatuses } from "./lifecycle";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

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

export function isValidAnalyticsTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export const reliabilityAnalyticsQuery = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidAnalyticsTimeZone, "Unknown IANA timezone")
      .default("UTC"),
    status: csvArray(z.enum(incidentStatuses)).optional(),
    severity: csvArray(z.enum(incidentSeverities)).optional(),
    service: csvArray(z.string().trim().min(1).max(128)).optional(),
    compare: z
      .preprocess((value) => value === true || value === "true", z.boolean())
      .default(true),
    includeDemo: z
      .preprocess((value) => value === true || value === "true", z.boolean())
      .default(false),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must not be after to",
    path: ["from"],
  });

export type ReliabilityAnalyticsQuery = z.infer<
  typeof reliabilityAnalyticsQuery
>;

export type ResolvedReliabilityAnalyticsQuery = Omit<
  ReliabilityAnalyticsQuery,
  "from" | "to" | "status" | "severity" | "service"
> & {
  from: string;
  to: string;
  status: NonNullable<ReliabilityAnalyticsQuery["status"]>;
  severity: NonNullable<ReliabilityAnalyticsQuery["severity"]>;
  service: NonNullable<ReliabilityAnalyticsQuery["service"]>;
};

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function resolveReliabilityAnalyticsQuery(
  input: ReliabilityAnalyticsQuery,
  now = new Date(),
): ResolvedReliabilityAnalyticsQuery {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    ...input,
    from: input.from ?? formatUtcDate(from),
    to: input.to ?? formatUtcDate(to),
    status: input.status ?? [],
    severity: input.severity ?? [],
    service: input.service ?? [],
  };
}

export function previousReliabilityPeriod(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const days =
    Math.round((toDate.valueOf() - fromDate.valueOf()) / 86_400_000) + 1;
  const previousTo = new Date(fromDate);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1);
  return {
    from: formatUtcDate(previousFrom),
    to: formatUtcDate(previousTo),
  };
}
