import type { RelayOpsIncidentStatus } from "./relayops-lifecycle";

export const relayOpsIncidentStatuses = [
  "detected",
  "triaging",
  "mitigating",
  "monitoring",
  "resolved",
  "dismissed",
] as const satisfies readonly RelayOpsIncidentStatus[];

export const relayOpsActiveStatuses = [
  "detected",
  "triaging",
  "mitigating",
  "monitoring",
] as const satisfies readonly RelayOpsIncidentStatus[];

export const relayOpsSeverities = [
  "unknown",
  "sev1",
  "sev2",
  "sev3",
  "sev4",
] as const;

export const workbenchSortFields = [
  "severity",
  "status",
  "detectedAt",
  "lastUpdateAt",
  "title",
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

export type RelayOpsSeverity = (typeof relayOpsSeverities)[number];
export type WorkbenchSortField = (typeof workbenchSortFields)[number];
export type WorkbenchColumnId = (typeof workbenchColumnIds)[number];
export type WorkbenchGroup =
  | "none"
  | "status"
  | "severity"
  | "service"
  | "commander";
export type WorkbenchDensity = "compact" | "comfortable";
export type WorkbenchInspectorTab = "overview" | "timeline" | "responders";

export type WorkbenchSort = {
  field: WorkbenchSortField;
  direction: "asc" | "desc";
};

export type WorkbenchColumnConfig = {
  id: WorkbenchColumnId;
  pin: "left" | "right" | null;
  width: number;
};

export type WorkbenchSearch = {
  view?: string;
  q: string;
  status: RelayOpsIncidentStatus[];
  severity: RelayOpsSeverity[];
  service: string[];
  commander: string[];
  from: string;
  to: string;
  sort: WorkbenchSort[];
  group: WorkbenchGroup;
  density: WorkbenchDensity;
  columns: WorkbenchColumnConfig[];
  incidentId?: string;
  tab: WorkbenchInspectorTab;
};

export type SavedWorkbenchDefinition = Pick<
  WorkbenchSearch,
  | "q"
  | "status"
  | "severity"
  | "service"
  | "commander"
  | "from"
  | "to"
  | "sort"
  | "group"
  | "density"
  | "columns"
>;

export const defaultWorkbenchSort: WorkbenchSort[] = [
  { field: "severity", direction: "desc" },
  { field: "detectedAt", direction: "desc" },
];

export const defaultWorkbenchColumns: WorkbenchColumnConfig[] = [
  { id: "key", pin: "left", width: 112 },
  { id: "severity", pin: "left", width: 92 },
  { id: "status", pin: null, width: 124 },
  { id: "title", pin: null, width: 300 },
  { id: "affectedServices", pin: null, width: 220 },
  { id: "commander", pin: null, width: 180 },
  { id: "responders", pin: null, width: 220 },
  { id: "detectedAt", pin: null, width: 180 },
  { id: "elapsed", pin: null, width: 140 },
  { id: "lastUpdateAt", pin: null, width: 180 },
];

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const groups = new Set<WorkbenchGroup>([
  "none",
  "status",
  "severity",
  "service",
  "commander",
]);
const densities = new Set<WorkbenchDensity>(["compact", "comfortable"]);
const tabs = new Set<WorkbenchInspectorTab>([
  "overview",
  "timeline",
  "responders",
]);
const statusSet = new Set<string>(relayOpsIncidentStatuses);
const severitySet = new Set<string>(relayOpsSeverities);
const sortFieldSet = new Set<string>(workbenchSortFields);
const columnSet = new Set<string>(workbenchColumnIds);

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getWorkbenchDateDefaults(now = new Date()) {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: formatUtcDate(from), to: formatUtcDate(to) };
}

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && formatUtcDate(parsed) === value;
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
  return values.flatMap((item) =>
    typeof item === "string" ? item.split(",") : [],
  );
}

function normalizedList(
  value: unknown,
  predicate: (item: string) => boolean,
  fallback: readonly string[] = [],
) {
  if (value === undefined || value === null) return [...fallback];
  return Array.from(
    new Set(
      listValue(value)
        .map((item) => item.trim())
        .filter(predicate),
    ),
  ).sort();
}

function parseSort(value: unknown) {
  if (value === undefined || value === null) {
    return defaultWorkbenchSort.map((item) => ({ ...item }));
  }
  const seen = new Set<string>();
  const parsed: WorkbenchSort[] = [];
  for (const token of listValue(value)) {
    const trimmed = token.trim();
    const direction = trimmed.startsWith("-") ? "desc" : "asc";
    const field = (trimmed.startsWith("-") ? trimmed.slice(1) : trimmed) as
      | WorkbenchSortField
      | "";
    if (!field || !sortFieldSet.has(field) || seen.has(field)) continue;
    parsed.push({ field, direction });
    seen.add(field);
    if (parsed.length === 3) break;
  }
  return parsed.length > 0
    ? parsed
    : defaultWorkbenchSort.map((item) => ({ ...item }));
}

function parseColumns(value: unknown) {
  const raw = stringValue(value);
  if (raw === undefined) return [...defaultWorkbenchColumns];
  const tokens = raw.startsWith("v1:") ? raw.slice(3).split(".") : [];
  const seen = new Set<string>();
  const columns = tokens.flatMap((token) => {
    const [id, pinCode = "n", rawWidth = "160"] = token.split("~");
    if (!id || !columnSet.has(id) || seen.has(id)) return [];
    const width = Number(rawWidth);
    if (!Number.isInteger(width) || width < 80 || width > 640) return [];
    seen.add(id);
    return [
      {
        id: id as WorkbenchColumnId,
        pin:
          pinCode === "l"
            ? ("left" as const)
            : pinCode === "r"
              ? ("right" as const)
              : null,
        width,
      },
    ];
  });
  return columns.length > 0
    ? columns
    : defaultWorkbenchColumns.map((column) => ({ ...column }));
}

export function parseWorkbenchSearch(
  raw: Record<string, unknown>,
  now = new Date(),
): WorkbenchSearch {
  const dateDefaults = getWorkbenchDateDefaults(now);
  const rawFrom = stringValue(raw.from);
  const rawTo = stringValue(raw.to);
  let from = rawFrom && isValidDate(rawFrom) ? rawFrom : dateDefaults.from;
  let to = rawTo && isValidDate(rawTo) ? rawTo : dateDefaults.to;
  if (from > to) ({ from, to } = dateDefaults);

  const q = (stringValue(raw.q) ?? "").trim().slice(0, 200);
  const view = stringValue(raw.view);
  const incidentId = stringValue(raw.incidentId);
  const group = stringValue(raw.group) as WorkbenchGroup | undefined;
  const density = stringValue(raw.density) as WorkbenchDensity | undefined;
  const tab = stringValue(raw.tab) as WorkbenchInspectorTab | undefined;

  return {
    view: view && idPattern.test(view) ? view : undefined,
    q,
    status: normalizedList(
      raw.status,
      (item) => statusSet.has(item),
      relayOpsActiveStatuses,
    ) as RelayOpsIncidentStatus[],
    severity: normalizedList(raw.severity, (item) =>
      severitySet.has(item),
    ) as RelayOpsSeverity[],
    service: normalizedList(raw.service, (item) => idPattern.test(item)),
    commander: normalizedList(raw.commander, (item) => idPattern.test(item)),
    from,
    to,
    sort: parseSort(raw.sort),
    group: group && groups.has(group) ? group : "none",
    density: density && densities.has(density) ? density : "compact",
    columns: parseColumns(raw.columns),
    incidentId:
      incidentId && idPattern.test(incidentId) ? incidentId : undefined,
    tab: tab && tabs.has(tab) ? tab : "overview",
  };
}

export function serializeWorkbenchSearch(search: WorkbenchSearch) {
  const params = new URLSearchParams();
  if (search.view) params.set("view", search.view);
  if (search.q) params.set("q", search.q);
  params.set("status", [...search.status].sort().join(","));
  params.set("severity", [...search.severity].sort().join(","));
  params.set("service", [...search.service].sort().join(","));
  params.set("commander", [...search.commander].sort().join(","));
  params.set("from", search.from);
  params.set("to", search.to);
  params.set(
    "sort",
    search.sort
      .map(
        ({ field, direction }) => `${direction === "desc" ? "-" : ""}${field}`,
      )
      .join(","),
  );
  params.set("group", search.group);
  params.set("density", search.density);
  params.set(
    "columns",
    `v1:${search.columns
      .map(
        (column) =>
          `${column.id}~${column.pin === "left" ? "l" : column.pin === "right" ? "r" : "n"}~${column.width}`,
      )
      .join(".")}`,
  );
  if (search.incidentId) params.set("incidentId", search.incidentId);
  params.set("tab", search.tab);
  return params.toString();
}

const savedKeys = [
  "q",
  "status",
  "severity",
  "service",
  "commander",
  "from",
  "to",
  "sort",
  "group",
  "density",
  "columns",
] as const;

export function mergeSavedWorkbenchSearch(
  saved: SavedWorkbenchDefinition | undefined,
  explicit: Record<string, unknown>,
  now = new Date(),
) {
  const defaults = parseWorkbenchSearch({}, now);
  const base = saved ? { ...defaults, ...saved } : defaults;
  const explicitParsed = parseWorkbenchSearch(explicit, now);
  const merged: WorkbenchSearch = { ...base };

  for (const key of savedKeys) {
    if (Object.hasOwn(explicit, key)) {
      Object.assign(merged, { [key]: explicitParsed[key] });
    }
  }
  if (Object.hasOwn(explicit, "view")) merged.view = explicitParsed.view;
  if (Object.hasOwn(explicit, "incidentId")) {
    merged.incidentId = explicitParsed.incidentId;
  }
  if (Object.hasOwn(explicit, "tab")) merged.tab = explicitParsed.tab;
  return merged;
}

export function toSavedWorkbenchDefinition(
  search: WorkbenchSearch,
): SavedWorkbenchDefinition {
  const definition = {} as SavedWorkbenchDefinition;
  for (const key of savedKeys) {
    Object.assign(definition, { [key]: search[key] });
  }
  return definition;
}

export function workbenchQueryIdentity(search: WorkbenchSearch) {
  return JSON.stringify({
    q: search.q,
    status: search.status,
    severity: search.severity,
    service: search.service,
    commander: search.commander,
    from: search.from,
    to: search.to,
    sort: search.sort,
    group: search.group,
  });
}

export function shouldResetWorkbenchCursor(
  previous: WorkbenchSearch,
  next: WorkbenchSearch,
) {
  return workbenchQueryIdentity(previous) !== workbenchQueryIdentity(next);
}

export function canonicalizeWorkbenchSearch(
  raw: Record<string, unknown>,
  now = new Date(),
) {
  const search = parseWorkbenchSearch(raw, now);
  return { search, canonical: serializeWorkbenchSearch(search) };
}
