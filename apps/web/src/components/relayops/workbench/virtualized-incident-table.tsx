import { ArrowDown, ArrowUp, Columns3, Pin, PinOff } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  useMemo,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelayOpsDateTime } from "@/lib/relayops-format";
import {
  defaultWorkbenchColumns,
  type WorkbenchColumnConfig,
  type WorkbenchColumnId,
  type WorkbenchSort,
  type WorkbenchSortField,
  workbenchColumnIds,
} from "@/lib/relayops-workbench-search";
import type { WorkbenchIncidentItem, WorkbenchLabels } from "./types";

const overscan = 4;
const sortableColumns: Partial<Record<WorkbenchColumnId, WorkbenchSortField>> =
  {
    title: "title",
    status: "status",
    severity: "severity",
    service: "service",
    affectedServices: "service",
    commander: "commander",
    detectedAt: "detectedAt",
    elapsed: "detectedAt",
    lastUpdateAt: "lastUpdateAt",
  };

function formatDuration(
  start: string,
  end: string | null,
  labels: WorkbenchLabels,
) {
  const duration = Math.max(
    0,
    Date.parse(end ?? new Date().toISOString()) - Date.parse(start),
  );
  const totalMinutes = Math.floor(duration / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? `${hours}${labels.hourShort} ${minutes}${labels.minuteShort}`
    : `${minutes}${labels.minuteShort}`;
}

function cellContent(
  row: WorkbenchIncidentItem,
  columnId: WorkbenchColumnId,
  labels: WorkbenchLabels,
) {
  switch (columnId) {
    case "key":
      return (
        <span className="font-mono text-[#245ebe] dark:text-[#8fb6ff]">
          {row.key}
        </span>
      );
    case "title":
      return (
        <span
          className="block max-w-full truncate font-medium"
          title={row.title}
        >
          {row.title}
        </span>
      );
    case "status":
      return <Badge variant="outline">{labels.statusById[row.status]}</Badge>;
    case "severity":
      return (
        <Badge className="bg-[#b73a34] text-white">
          {labels.severityById[row.severity]}
        </Badge>
      );
    case "impact":
      return labels.impactById[row.impact];
    case "service":
      return row.service.name;
    case "affectedServices":
      return row.affectedServices.map((service) => service.name).join(", ");
    case "commander":
      return row.commander?.name ?? "—";
    case "responders":
      return (
        row.responders.map((responder) => responder.name).join(", ") || "—"
      );
    case "detectedAt":
      return formatRelayOpsDateTime(row.detectedAt);
    case "elapsed":
      return formatDuration(row.detectedAt, row.resolvedAt, labels);
    case "lastUpdateAt":
      return formatRelayOpsDateTime(row.lastUpdateAt);
  }
}

function columnOffsets(columns: WorkbenchColumnConfig[]) {
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  let leftOffset = 44;
  for (const column of columns) {
    if (column.pin === "left") {
      left.set(column.id, leftOffset);
      leftOffset += column.width;
    }
  }
  let rightOffset = 0;
  for (const column of [...columns].reverse()) {
    if (column.pin === "right") {
      right.set(column.id, rightOffset);
      rightOffset += column.width;
    }
  }
  return { left, right };
}

function pinnedStyle(
  column: WorkbenchColumnConfig,
  offsets: ReturnType<typeof columnOffsets>,
): CSSProperties {
  if (!column.pin) return { width: column.width, minWidth: column.width };
  return {
    position: "sticky",
    left: column.pin === "left" ? offsets.left.get(column.id) : undefined,
    right: column.pin === "right" ? offsets.right.get(column.id) : undefined,
    width: column.width,
    minWidth: column.width,
    zIndex: 2,
  };
}

function nextSort(
  current: WorkbenchSort[],
  field: WorkbenchSortField,
  additive: boolean,
) {
  const existing = current.find((item) => item.field === field);
  const replacement: WorkbenchSort = {
    field,
    direction: existing?.direction === "asc" ? "desc" : "asc",
  };
  if (!additive) return [replacement];
  const without = current.filter((item) => item.field !== field);
  return [...without, replacement].slice(-3);
}

export function WorkbenchColumnConfiguration({
  columns,
  labels,
  onChange,
}: {
  columns: WorkbenchColumnConfig[];
  labels: WorkbenchLabels;
  onChange: (columns: WorkbenchColumnConfig[]) => void;
}) {
  const visible = new Map(columns.map((column) => [column.id, column]));

  return (
    <details className="relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border bg-background px-3 text-sm">
        <Columns3 className="size-4" aria-hidden="true" />
        {labels.columns}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border bg-popover p-3 shadow-lg">
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {workbenchColumnIds.map((id) => {
            const column = visible.get(id);
            const index = column
              ? columns.findIndex((item) => item.id === id)
              : -1;
            return (
              <li
                key={id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1.5"
              >
                <label className="flex min-h-8 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(column)}
                    disabled={Boolean(column) && columns.length === 1}
                    onChange={(event) => {
                      if (event.target.checked) {
                        const defaultColumn = defaultWorkbenchColumns.find(
                          (item) => item.id === id,
                        ) ?? { id, pin: null, width: 160 };
                        onChange([...columns, { ...defaultColumn }]);
                      } else {
                        onChange(columns.filter((item) => item.id !== id));
                      }
                    }}
                  />
                  <span>{labels.columnsById[id]}</span>
                </label>
                {column ? (
                  <div className="flex gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`${labels.moveEarlier}: ${labels.columnsById[id]}`}
                      disabled={index <= 0}
                      onClick={() => {
                        const next = [...columns];
                        const previous = next[index - 1];
                        if (!previous) return;
                        next[index - 1] = column;
                        next[index] = previous;
                        onChange(next);
                      }}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`${labels.moveLater}: ${labels.columnsById[id]}`}
                      disabled={index === columns.length - 1}
                      onClick={() => {
                        const next = [...columns];
                        const following = next[index + 1];
                        if (!following) return;
                        next[index + 1] = column;
                        next[index] = following;
                        onChange(next);
                      }}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`${labels.pinColumn}: ${labels.columnsById[id]}`}
                      onClick={() =>
                        onChange(
                          columns.map((item) =>
                            item.id === id
                              ? {
                                  ...item,
                                  pin:
                                    item.pin === null
                                      ? "left"
                                      : item.pin === "left"
                                        ? "right"
                                        : null,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      {column.pin ? <Pin /> : <PinOff />}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`${labels.narrowColumn}: ${labels.columnsById[id]}`}
                      disabled={column.width <= 80}
                      onClick={() =>
                        onChange(
                          columns.map((item) =>
                            item.id === id
                              ? {
                                  ...item,
                                  width: Math.max(80, item.width - 24),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      −
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`${labels.widenColumn}: ${labels.columnsById[id]}`}
                      disabled={column.width >= 640}
                      onClick={() =>
                        onChange(
                          columns.map((item) =>
                            item.id === id
                              ? {
                                  ...item,
                                  width: Math.min(640, item.width + 24),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      +
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

type VirtualizedIncidentTableProps = {
  items: WorkbenchIncidentItem[];
  columns: WorkbenchColumnConfig[];
  sort: WorkbenchSort[];
  density: "compact" | "comfortable";
  selectedIncidentId?: string;
  selectedIds: Set<string>;
  labels: WorkbenchLabels;
  viewportHeight?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onSortChange: (sort: WorkbenchSort[]) => void;
  onSelectIncident: (incidentId: string, trigger: HTMLTableRowElement) => void;
  onSelectionChange: (ids: Set<string>) => void;
  onLoadMore?: () => void;
};

export const VirtualizedIncidentTable = memo(function VirtualizedIncidentTable({
  items,
  columns,
  sort,
  density,
  selectedIncidentId,
  selectedIds,
  labels,
  viewportHeight = 560,
  hasMore,
  isLoadingMore,
  onSortChange,
  onSelectIncident,
  onSelectionChange,
  onLoadMore,
}: VirtualizedIncidentTableProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = density === "compact" ? 44 : 58;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const visibleItems = items.slice(startIndex, endIndex);
  const topSpacer = startIndex * rowHeight;
  const bottomSpacer = Math.max(0, (items.length - endIndex) * rowHeight);
  const offsets = useMemo(() => columnOffsets(columns), [columns]);
  const tableWidth =
    44 + columns.reduce((total, column) => total + column.width, 0);

  const openRow = (
    row: WorkbenchIncidentItem,
    event:
      | React.MouseEvent<HTMLTableRowElement>
      | KeyboardEvent<HTMLTableRowElement>,
  ) => {
    onSelectIncident(row.id, event.currentTarget);
  };

  return (
    <div
      data-testid="workbench-scroll-viewport"
      className="relative overflow-auto rounded-xl border bg-background"
      style={{ height: viewportHeight }}
      onScroll={(event) => {
        const target = event.currentTarget;
        setScrollTop(target.scrollTop);
        if (
          hasMore &&
          !isLoadingMore &&
          target.scrollTop + target.clientHeight >=
            target.scrollHeight - rowHeight * 4
        ) {
          onLoadMore?.();
        }
      }}
    >
      <table
        className="border-separate border-spacing-0 text-sm"
        style={{ width: tableWidth, minWidth: "100%" }}
        aria-rowcount={items.length + 1}
      >
        <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
          <TableRow>
            <TableHead
              className="sticky left-0 z-30 w-11 min-w-11 bg-background"
              aria-label={labels.selectIncident}
            />
            {columns.map((column) => {
              const sortField = sortableColumns[column.id];
              const activeSort = sort.find((item) => item.field === sortField);
              return (
                <TableHead
                  key={column.id}
                  className={column.pin ? "bg-background" : undefined}
                  style={pinnedStyle(column, offsets)}
                  aria-sort={
                    activeSort?.direction === "asc"
                      ? "ascending"
                      : activeSort?.direction === "desc"
                        ? "descending"
                        : undefined
                  }
                >
                  {sortField ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 text-left"
                      aria-label={`${labels.sortColumn}: ${labels.columnsById[column.id]}`}
                      onClick={(event) =>
                        onSortChange(nextSort(sort, sortField, event.shiftKey))
                      }
                    >
                      {labels.columnsById[column.id]}
                      {activeSort?.direction === "asc" ? (
                        <ArrowUp className="size-3.5" />
                      ) : activeSort?.direction === "desc" ? (
                        <ArrowDown className="size-3.5" />
                      ) : null}
                    </button>
                  ) : (
                    labels.columnsById[column.id]
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {topSpacer > 0 ? (
            <tr style={{ height: topSpacer }}>
              <td colSpan={columns.length + 1} />
            </tr>
          ) : null}
          {visibleItems.map((row) => (
            <TableRow
              key={row.id}
              data-testid="workbench-row"
              data-state={
                row.id === selectedIncidentId ? "selected" : undefined
              }
              tabIndex={0}
              style={{ height: rowHeight }}
              onClick={(event) => openRow(row, event)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openRow(row, event);
                }
              }}
            >
              <TableCell className="sticky left-0 z-10 w-11 min-w-11 bg-background">
                <input
                  type="checkbox"
                  aria-label={`${labels.selectIncident}: ${row.key}`}
                  checked={selectedIds.has(row.id)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const next = new Set(selectedIds);
                    if (event.target.checked) next.add(row.id);
                    else next.delete(row.id);
                    onSelectionChange(next);
                  }}
                />
              </TableCell>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={
                    column.pin
                      ? "overflow-hidden bg-background text-ellipsis"
                      : "overflow-hidden text-ellipsis"
                  }
                  style={pinnedStyle(column, offsets)}
                >
                  {cellContent(row, column.id, labels)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {bottomSpacer > 0 ? (
            <tr style={{ height: bottomSpacer }}>
              <td colSpan={columns.length + 1} />
            </tr>
          ) : null}
        </TableBody>
      </table>
      {hasMore ? (
        <div className="sticky bottom-0 flex justify-center border-t bg-background/95 p-2">
          <Button
            size="sm"
            variant="outline"
            loading={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? labels.loadingMore : labels.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
});
