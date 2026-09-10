import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import type {
  IncidentImpact,
  IncidentSeverity,
  IncidentStatus,
} from "./lifecycle";
import type {
  IncidentWorkbenchQuery,
  workbenchSortFields,
} from "./workbench-schema";

type WorkbenchSortField = (typeof workbenchSortFields)[number];
type SortSpec = {
  field: WorkbenchSortField | "id";
  direction: "asc" | "desc";
};

type WorkbenchRow = {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  status: string;
  severity: string;
  impact: string;
  version: number;
  detectedAt: Date;
  lastUpdateAt: Date;
  serviceId: string;
  resolvedAt: Date | null;
  serviceName: string;
  serviceSlug: string;
  commanderId: string | null;
  commanderName: string | null;
};

type CursorValue = string | number;
type WorkbenchCursor = {
  v: 1;
  workspaceId: string;
  sort: string;
  values: CursorValue[];
  query: string;
};

const activeStatuses: IncidentStatus[] = [
  "detected",
  "triaging",
  "mitigating",
  "monitoring",
];

const allStatuses: IncidentStatus[] = [
  "detected",
  "triaging",
  "mitigating",
  "monitoring",
  "resolved",
  "dismissed",
];

const defaultSort: SortSpec[] = [
  { field: "severity", direction: "desc" },
  { field: "detectedAt", direction: "desc" },
];

function startOfUtcDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfUtcDay(value: string) {
  const date = startOfUtcDay(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function rollingDateRange(now = new Date()) {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 31);
  return { from, to };
}

function resolvedSort(input: IncidentWorkbenchQuery): SortSpec[] {
  return [
    ...(input.sort ?? defaultSort),
    { field: "id" as const, direction: "asc" as const },
  ];
}

function querySignature(input: IncidentWorkbenchQuery) {
  return JSON.stringify({
    q: input.q ?? "",
    status: input.status ?? null,
    severity: input.severity ?? null,
    service: input.service ?? null,
    commander: input.commander ?? null,
    from: input.from ?? null,
    to: input.to ?? null,
    group: input.group,
  });
}

function sortSignature(sort: SortSpec[]) {
  return sort
    .map((item) => `${item.direction === "desc" ? "-" : ""}${item.field}`)
    .join(",");
}

function severityRank() {
  return sql<number>`case ${schema.incidentTable.severity}
    when 'sev1' then 5
    when 'sev2' then 4
    when 'sev3' then 3
    when 'sev4' then 2
    else 1 end`;
}

function statusRank() {
  return sql<number>`case ${schema.incidentTable.status}
    when 'detected' then 6
    when 'triaging' then 5
    when 'mitigating' then 4
    when 'monitoring' then 3
    when 'resolved' then 2
    else 1 end`;
}

function sortExpression(field: SortSpec["field"]): SQL {
  switch (field) {
    case "severity":
      return severityRank();
    case "status":
      return statusRank();
    case "detectedAt":
      return sql`${schema.incidentTable.detectedAt}`;
    case "lastUpdateAt":
      return sql`${schema.incidentTable.lastUpdateAt}`;
    case "title":
      return sql`lower(${schema.incidentTable.title})`;
    case "service":
      return sql`lower(${schema.serviceTable.name})`;
    case "commander":
      return sql`lower(coalesce(${schema.userTable.name}, ''))`;
    case "id":
      return sql`${schema.incidentTable.id}`;
  }
}

function rowSortValue(row: WorkbenchRow, field: SortSpec["field"]) {
  switch (field) {
    case "severity":
      return { sev1: 5, sev2: 4, sev3: 3, sev4: 2, unknown: 1 }[
        row.severity as IncidentSeverity
      ];
    case "status":
      return {
        detected: 6,
        triaging: 5,
        mitigating: 4,
        monitoring: 3,
        resolved: 2,
        dismissed: 1,
      }[row.status as IncidentStatus];
    case "detectedAt":
      return row.detectedAt.toISOString();
    case "lastUpdateAt":
      return row.lastUpdateAt.toISOString();
    case "title":
      return row.title.toLocaleLowerCase("en-US");
    case "service":
      return row.serviceName.toLocaleLowerCase("en-US");
    case "commander":
      return (row.commanderName ?? "").toLocaleLowerCase("en-US");
    case "id":
      return row.id;
  }
}

function encodeCursor(
  workspaceId: string,
  sort: SortSpec[],
  row: WorkbenchRow,
  input: IncidentWorkbenchQuery,
) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      workspaceId,
      sort: sortSignature(sort),
      values: sort.map((item) => rowSortValue(row, item.field)),
      query: querySignature(input),
    } satisfies WorkbenchCursor),
  ).toString("base64url");
}

function decodeCursor(
  cursor: string,
  workspaceId: string,
  sort: SortSpec[],
  input: IncidentWorkbenchQuery,
): WorkbenchCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<WorkbenchCursor>;
    if (
      parsed.v !== 1 ||
      parsed.workspaceId !== workspaceId ||
      parsed.sort !== sortSignature(sort) ||
      parsed.query !== querySignature(input) ||
      !Array.isArray(parsed.values) ||
      parsed.values.length !== sort.length ||
      parsed.values.some(
        (value) => typeof value !== "string" && typeof value !== "number",
      )
    ) {
      throw new Error("Cursor scope or shape mismatch");
    }
    return parsed as WorkbenchCursor;
  } catch {
    throw new HTTPException(400, {
      message: "Invalid or stale workbench cursor",
    });
  }
}

function cursorSqlValue(field: SortSpec["field"], value: CursorValue) {
  if (field === "detectedAt" || field === "lastUpdateAt") {
    const date = new Date(String(value));
    if (Number.isNaN(date.valueOf())) {
      throw new HTTPException(400, {
        message: "Invalid workbench cursor date",
      });
    }
    return date;
  }
  return value;
}

function cursorCondition(sort: SortSpec[], cursor: WorkbenchCursor) {
  const alternatives: SQL[] = [];
  for (let index = 0; index < sort.length; index += 1) {
    const equalPrefix: SQL[] = [];
    for (let prefix = 0; prefix < index; prefix += 1) {
      const prefixItem = sort[prefix];
      const prefixValue = cursor.values[prefix];
      if (!prefixItem || prefixValue === undefined) continue;
      equalPrefix.push(
        sql`${sortExpression(prefixItem.field)} = ${cursorSqlValue(
          prefixItem.field,
          prefixValue,
        )}`,
      );
    }
    const item = sort[index];
    const cursorValue = cursor.values[index];
    if (!item || cursorValue === undefined) continue;
    const operator = item.direction === "desc" ? sql.raw("<") : sql.raw(">");
    alternatives.push(
      sql`(${and(
        ...equalPrefix,
        sql`${sortExpression(item.field)} ${operator} ${cursorSqlValue(
          item.field,
          cursorValue,
        )}`,
      )})`,
    );
  }
  return or(...alternatives);
}

function buildConditions(
  workspaceId: string,
  input: IncidentWorkbenchQuery,
  cursor?: WorkbenchCursor,
  sort?: SortSpec[],
) {
  const range = rollingDateRange();
  const conditions: SQL[] = [
    eq(schema.incidentTable.workspaceId, workspaceId),
    inArray(
      schema.incidentTable.status,
      input.status === undefined
        ? activeStatuses
        : input.status.length > 0
          ? input.status
          : allStatuses,
    ),
    gte(
      schema.incidentTable.detectedAt,
      input.from ? startOfUtcDay(input.from) : range.from,
    ),
    lt(
      schema.incidentTable.detectedAt,
      input.to ? endOfUtcDay(input.to) : range.to,
    ),
  ];

  if (input.q) {
    const escaped = input.q
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    const pattern = `%${escaped}%`;
    conditions.push(
      or(
        sql`${schema.incidentTable.title} ilike ${pattern} escape '\\'`,
        sql`coalesce(${schema.incidentTable.summary}, '') ilike ${pattern} escape '\\'`,
        sql`${schema.serviceTable.name} ilike ${pattern} escape '\\'`,
        sql`coalesce(${schema.userTable.name}, '') ilike ${pattern} escape '\\'`,
        sql`('INC-' || ${schema.incidentTable.number}::text) ilike ${pattern} escape '\\'`,
      ) as SQL,
    );
  }
  if (input.severity?.length) {
    conditions.push(inArray(schema.incidentTable.severity, input.severity));
  }
  if (input.commander?.length) {
    conditions.push(inArray(schema.incidentTable.commanderId, input.commander));
  }
  if (input.service?.length) {
    conditions.push(
      or(
        inArray(schema.incidentTable.serviceId, input.service),
        sql`exists (
          select 1 from ${schema.incidentAffectedServiceTable} affected
          where affected.workspace_id = ${workspaceId}
            and affected.incident_id = ${schema.incidentTable.id}
            and affected.service_id in (${sql.join(
              input.service.map((serviceId) => sql`${serviceId}`),
              sql.raw(", "),
            )})
        )`,
      ) as SQL,
    );
  }
  if (cursor && sort) {
    const condition = cursorCondition(sort, cursor);
    if (condition) conditions.push(condition);
  }
  return conditions;
}

function facetRows(
  rows: Array<{ value: string | null; label: string | null; count: number }>,
  unassignedLabel = "Unassigned",
) {
  return rows.map((row) => ({
    value: row.value ?? "unassigned",
    label: row.label ?? unassignedLabel,
    count: Number(row.count),
  }));
}

export async function listIncidentWorkbench(
  workspaceId: string,
  input: IncidentWorkbenchQuery,
) {
  const sort = resolvedSort(input);
  const cursor = input.cursor
    ? decodeCursor(input.cursor, workspaceId, sort, input)
    : undefined;
  const conditions = buildConditions(workspaceId, input, cursor, sort);
  const facetConditions = buildConditions(workspaceId, input);
  const joins = {
    service: and(
      eq(schema.incidentTable.workspaceId, schema.serviceTable.workspaceId),
      eq(schema.incidentTable.serviceId, schema.serviceTable.id),
    ),
    commander: eq(schema.incidentTable.commanderId, schema.userTable.id),
  };

  const itemQuery = db
    .select({
      id: schema.incidentTable.id,
      number: schema.incidentTable.number,
      title: schema.incidentTable.title,
      summary: schema.incidentTable.summary,
      status: schema.incidentTable.status,
      severity: schema.incidentTable.severity,
      impact: schema.incidentTable.impact,
      version: schema.incidentTable.version,
      detectedAt: schema.incidentTable.detectedAt,
      lastUpdateAt: schema.incidentTable.lastUpdateAt,
      resolvedAt: schema.incidentTable.resolvedAt,
      serviceId: schema.serviceTable.id,
      serviceName: schema.serviceTable.name,
      serviceSlug: schema.serviceTable.slug,
      commanderId: schema.userTable.id,
      commanderName: schema.userTable.name,
    })
    .from(schema.incidentTable)
    .innerJoin(schema.serviceTable, joins.service)
    .leftJoin(schema.userTable, joins.commander)
    .where(and(...conditions))
    .orderBy(
      ...sort.map((item) =>
        item.direction === "desc"
          ? desc(sortExpression(item.field))
          : asc(sortExpression(item.field)),
      ),
    )
    .limit(input.limit + 1);

  const statusQuery = db
    .select({
      value: schema.incidentTable.status,
      label: schema.incidentTable.status,
      count: sql<number>`count(distinct ${schema.incidentTable.id})::int`,
    })
    .from(schema.incidentTable)
    .innerJoin(schema.serviceTable, joins.service)
    .leftJoin(schema.userTable, joins.commander)
    .where(and(...facetConditions))
    .groupBy(schema.incidentTable.status)
    .orderBy(desc(sql`count(distinct ${schema.incidentTable.id})`));

  const severityQuery = db
    .select({
      value: schema.incidentTable.severity,
      label: schema.incidentTable.severity,
      count: sql<number>`count(distinct ${schema.incidentTable.id})::int`,
    })
    .from(schema.incidentTable)
    .innerJoin(schema.serviceTable, joins.service)
    .leftJoin(schema.userTable, joins.commander)
    .where(and(...facetConditions))
    .groupBy(schema.incidentTable.severity)
    .orderBy(desc(sql`count(distinct ${schema.incidentTable.id})`));

  const serviceQuery = db
    .select({
      value: schema.serviceTable.id,
      label: schema.serviceTable.name,
      count: sql<number>`count(distinct ${schema.incidentTable.id})::int`,
    })
    .from(schema.incidentTable)
    .innerJoin(schema.serviceTable, joins.service)
    .leftJoin(schema.userTable, joins.commander)
    .where(and(...facetConditions))
    .groupBy(schema.serviceTable.id, schema.serviceTable.name)
    .orderBy(desc(sql`count(distinct ${schema.incidentTable.id})`));

  const commanderQuery = db
    .select({
      value: schema.userTable.id,
      label: schema.userTable.name,
      count: sql<number>`count(distinct ${schema.incidentTable.id})::int`,
    })
    .from(schema.incidentTable)
    .innerJoin(schema.serviceTable, joins.service)
    .leftJoin(schema.userTable, joins.commander)
    .where(and(...facetConditions))
    .groupBy(schema.userTable.id, schema.userTable.name)
    .orderBy(desc(sql`count(distinct ${schema.incidentTable.id})`));

  const [rawRows, statusRows, severityRows, serviceRows, commanderRows] =
    await Promise.all([
      itemQuery,
      statusQuery,
      severityQuery,
      serviceQuery,
      commanderQuery,
    ]);
  const rows = rawRows as WorkbenchRow[];
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const pageIncidentIds = pageRows.map((row) => row.id);
  const [affectedRows, responderRows] =
    pageIncidentIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              incidentId: schema.incidentAffectedServiceTable.incidentId,
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
                eq(
                  schema.incidentAffectedServiceTable.workspaceId,
                  workspaceId,
                ),
                inArray(
                  schema.incidentAffectedServiceTable.incidentId,
                  pageIncidentIds,
                ),
              ),
            )
            .orderBy(
              asc(schema.serviceTable.name),
              asc(schema.serviceTable.id),
            ),
          db
            .select({
              incidentId: schema.incidentResponderTable.incidentId,
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
                inArray(
                  schema.incidentResponderTable.incidentId,
                  pageIncidentIds,
                ),
              ),
            )
            .orderBy(asc(schema.userTable.name), asc(schema.userTable.id)),
        ]);
  const affectedByIncident = new Map<string, typeof affectedRows>();
  for (const affected of affectedRows) {
    const values = affectedByIncident.get(affected.incidentId) ?? [];
    values.push(affected);
    affectedByIncident.set(affected.incidentId, values);
  }
  const respondersByIncident = new Map<string, typeof responderRows>();
  for (const responder of responderRows) {
    const values = respondersByIncident.get(responder.incidentId) ?? [];
    values.push(responder);
    respondersByIncident.set(responder.incidentId, values);
  }
  const facets = {
    status: facetRows(statusRows),
    severity: facetRows(severityRows),
    service: facetRows(serviceRows),
    commander: facetRows(commanderRows),
  };

  return {
    items: pageRows.map((row) => ({
      affectedServices: [
        {
          id: row.serviceId,
          name: row.serviceName,
          slug: row.serviceSlug,
        },
        ...(affectedByIncident.get(row.id) ?? []).map(({ id, name, slug }) => ({
          id,
          name,
          slug,
        })),
      ],
      responders: (respondersByIncident.get(row.id) ?? []).map(
        ({ id, name }) => ({
          id,
          name,
        }),
      ),
      id: row.id,
      key: `INC-${row.number}`,
      title: row.title,
      summary: row.summary,
      status: row.status as IncidentStatus,
      resolvedAt: row.resolvedAt,
      severity: row.severity as IncidentSeverity,
      impact: row.impact as IncidentImpact,
      version: row.version,
      detectedAt: row.detectedAt,
      lastUpdateAt: row.lastUpdateAt,
      service: {
        id: row.serviceId,
        name: row.serviceName,
        slug: row.serviceSlug,
      },
      commander:
        row.commanderId && row.commanderName
          ? { id: row.commanderId, name: row.commanderName }
          : null,
    })),
    nextCursor:
      hasMore && pageRows.length > 0
        ? encodeCursor(workspaceId, sort, pageRows[pageRows.length - 1]!, input)
        : null,
    facets,
    groups:
      input.group === "none"
        ? []
        : facets[input.group as Exclude<typeof input.group, "none">],
  };
}
