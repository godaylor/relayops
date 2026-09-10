import type { RelayOpsIncidentStatus } from "./relayops-lifecycle";
import {
  type RelayOpsSeverity,
  relayOpsIncidentStatuses,
  relayOpsSeverities,
} from "./relayops-workbench-search";

export type ReliabilityAnalyticsSearch = {
  from: string;
  to: string;
  timezone: string;
  status: RelayOpsIncidentStatus[];
  severity: RelayOpsSeverity[];
  service: string[];
  compare: boolean;
  includeDemo: boolean;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const statusSet = new Set<string>(relayOpsIncidentStatuses);
const severitySet = new Set<string>(relayOpsSeverities);

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getReliabilityDateDefaults(now = new Date()) {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: formatDate(from), to: formatDate(to) };
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value.at(-1) === "string") {
    return value.at(-1) as string;
  }
  return undefined;
}

function listValue(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) =>
    typeof entry === "string" ? entry.split(",") : [],
  );
}

function normalizedList(value: unknown, predicate: (item: string) => boolean) {
  if (value === undefined || value === null) return [];
  return Array.from(
    new Set(
      listValue(value)
        .map((item) => item.trim())
        .filter(predicate),
    ),
  ).sort();
}

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && formatDate(parsed) === value;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function booleanValue(value: unknown, fallback: boolean) {
  const text = stringValue(value);
  if (text === "true") return true;
  if (text === "false") return false;
  if (typeof value === "boolean") return value;
  return fallback;
}

export function parseReliabilityAnalyticsSearch(
  raw: Record<string, unknown>,
  now = new Date(),
): ReliabilityAnalyticsSearch {
  const defaults = getReliabilityDateDefaults(now);
  const rawFrom = stringValue(raw.from);
  const rawTo = stringValue(raw.to);
  let from = rawFrom && isValidDate(rawFrom) ? rawFrom : defaults.from;
  let to = rawTo && isValidDate(rawTo) ? rawTo : defaults.to;
  if (from > to) ({ from, to } = defaults);
  const resolvedZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const rawZone = stringValue(raw.timezone);
  const timezone = rawZone && isValidTimeZone(rawZone) ? rawZone : resolvedZone;
  return {
    from,
    to,
    timezone,
    status: normalizedList(raw.status, (item) =>
      statusSet.has(item),
    ) as RelayOpsIncidentStatus[],
    severity: normalizedList(raw.severity, (item) =>
      severitySet.has(item),
    ) as RelayOpsSeverity[],
    service: normalizedList(raw.service, (item) => idPattern.test(item)),
    compare: booleanValue(raw.compare, true),
    includeDemo: booleanValue(raw.includeDemo, false),
  };
}

export function serializeReliabilityAnalyticsSearch(
  search: ReliabilityAnalyticsSearch,
) {
  const params = new URLSearchParams();
  params.set("from", search.from);
  params.set("to", search.to);
  params.set("timezone", search.timezone);
  params.set("status", [...search.status].sort().join(","));
  params.set("severity", [...search.severity].sort().join(","));
  params.set("service", [...search.service].sort().join(","));
  params.set("compare", String(search.compare));
  params.set("includeDemo", String(search.includeDemo));
  return params.toString();
}

export function reliabilityAnalyticsRouteSearch(
  search: ReliabilityAnalyticsSearch,
) {
  return Object.fromEntries(
    new URLSearchParams(serializeReliabilityAnalyticsSearch(search)).entries(),
  );
}
