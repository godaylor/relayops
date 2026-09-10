import { Link } from "@tanstack/react-router";
import { ExternalLink, RotateCw, ShieldX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IncidentDetailPanel } from "@/components/relayops/incident-detail-panel";
import { RelayOpsSkeleton } from "@/components/relayops/route-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet";
import { relayOpsActiveStatuses } from "@/lib/relayops-workbench-search";
import type { IncidentWorkbenchProps } from "./types";
import { VirtualizedIncidentTable } from "./virtualized-incident-table";
import { SavedViewControls, WorkbenchToolbar } from "./workbench-toolbar";

function hasDatasetFilters(search: IncidentWorkbenchProps["search"]) {
  return (
    Boolean(search.q) ||
    search.severity.length > 0 ||
    search.service.length > 0 ||
    search.commander.length > 0 ||
    search.group !== "none" ||
    search.status.join(",") !== [...relayOpsActiveStatuses].sort().join(",")
  );
}

export function IncidentWorkbench({
  workspaceId,
  search,
  labels,
  state,
  page,
  error,
  isFetching,
  isLoadingMore,
  selectedDetail,
  selectedDetailLoading,
  savedViews = [],
  savedViewConflict,
  partialBulk,
  onSearchChange,
  onSelectIncident,
  onLoadMore,
  onRetry,
  onCreateSavedView,
  onUpdateSavedView,
  onUseCurrentSavedView,
  onRetrySavedViewDraft,
}: IncidentWorkbenchProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastRowTrigger = useRef<HTMLTableRowElement | null>(null);
  const inspectorHeading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!selectedDetail) return;
    const frame = requestAnimationFrame(() =>
      inspectorHeading.current?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [selectedDetail]);

  const closeInspector = () => {
    onSelectIncident(undefined);
    const frame = requestAnimationFrame(() => lastRowTrigger.current?.focus());
    return () => cancelAnimationFrame(frame);
  };

  if (state === "loading") {
    return (
      <section aria-label={labels.loading}>
        <RelayOpsSkeleton rows={10} />
      </section>
    );
  }

  if (state === "denied") {
    return (
      <section className="grid min-h-96 place-items-center rounded-xl border bg-background p-8 text-center">
        <div>
          <ShieldX
            className="mx-auto size-9 text-[#b9651b]"
            aria-hidden="true"
          />
          <h1 className="mt-4 font-semibold text-2xl">{labels.deniedTitle}</h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            {labels.deniedDescription}
          </p>
        </div>
      </section>
    );
  }

  if (state === "error" || !page) {
    return (
      <section className="grid min-h-96 place-items-center rounded-xl border bg-background p-8 text-center">
        <div>
          <h1 className="font-semibold text-2xl">{labels.errorTitle}</h1>
          {error ? (
            <p className="mt-2 max-w-lg text-muted-foreground">
              {error.message}
            </p>
          ) : null}
          {onRetry ? (
            <Button className="mt-5" variant="outline" onClick={onRetry}>
              <RotateCw />
              {labels.retry}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const filtered = hasDatasetFilters(search);

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">
            {labels.title}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {labels.description}
          </p>
        </div>
        <div
          className="text-right text-muted-foreground text-sm"
          aria-live="polite"
        >
          {isFetching ? labels.backgroundRefresh : null}
          {selectedIds.size > 0 ? (
            <p>
              {labels.selectedCount.replace(
                "{{count}}",
                String(selectedIds.size),
              )}
            </p>
          ) : null}
        </div>
      </header>

      <SavedViewControls
        search={search}
        labels={labels}
        savedViews={savedViews}
        conflict={savedViewConflict}
        onSearchChange={onSearchChange}
        onCreate={onCreateSavedView}
        onUpdate={onUpdateSavedView}
        onUseCurrent={onUseCurrentSavedView}
        onRetryDraft={onRetrySavedViewDraft}
      />
      <WorkbenchToolbar
        search={search}
        labels={labels}
        facets={page.facets}
        onChange={onSearchChange}
      />

      {partialBulk ? (
        <p
          role="status"
          className="rounded-lg border border-[#b9651b]/35 bg-[#b9651b]/8 p-3 text-sm"
        >
          {labels.partialBulk
            .replace("{{succeeded}}", String(partialBulk.succeeded))
            .replace("{{total}}", String(partialBulk.total))}
        </p>
      ) : null}

      {page.groups.length > 0 ? (
        <section
          className="flex gap-2 overflow-x-auto rounded-xl border bg-background p-3"
          aria-label={labels.group}
        >
          {page.groups.map((group) => (
            <span
              key={group.value}
              className="shrink-0 rounded-full border px-3 py-1 text-sm"
            >
              {search.group === "status"
                ? (labels.statusById[
                    group.value as keyof typeof labels.statusById
                  ] ?? group.label)
                : search.group === "severity"
                  ? (labels.severityById[
                      group.value as keyof typeof labels.severityById
                    ] ?? group.label)
                  : group.label}{" "}
              · {group.count}
            </span>
          ))}
        </section>
      ) : null}

      {page.items.length === 0 ? (
        <section className="grid min-h-72 place-items-center rounded-xl border bg-background p-8 text-center">
          <div>
            <h2 className="font-semibold text-xl">
              {filtered ? labels.filteredEmptyTitle : labels.emptyTitle}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {filtered
                ? labels.filteredEmptyDescription
                : labels.emptyDescription}
            </p>
            {filtered ? (
              <Button
                className="mt-4"
                variant="outline"
                onClick={() =>
                  onSearchChange({
                    ...search,
                    q: "",
                    status: [...relayOpsActiveStatuses],
                    severity: [],
                    service: [],
                    commander: [],
                    group: "none",
                  })
                }
              >
                {labels.clearFilters}
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <VirtualizedIncidentTable
          items={page.items}
          columns={search.columns}
          sort={search.sort}
          density={search.density}
          selectedIncidentId={search.incidentId}
          selectedIds={selectedIds}
          labels={labels}
          hasMore={Boolean(page.nextCursor)}
          isLoadingMore={isLoadingMore}
          onSortChange={(sort) => onSearchChange({ ...search, sort })}
          onSelectIncident={(incidentId, trigger) => {
            lastRowTrigger.current = trigger;
            onSelectIncident(incidentId);
          }}
          onSelectionChange={setSelectedIds}
          onLoadMore={onLoadMore}
        />
      )}

      <Sheet
        open={Boolean(search.incidentId)}
        onOpenChange={(open) => {
          if (!open) closeInspector();
        }}
      >
        <SheetPopup side="right" className="max-w-4xl">
          <SheetHeader>
            <SheetTitle>{labels.inspectorTitle}</SheetTitle>
            <SheetDescription>{labels.inspectorDescription}</SheetDescription>
          </SheetHeader>
          <SheetPanel className="p-0">
            {selectedDetail ? (
              <IncidentDetailPanel
                workspaceId={workspaceId}
                detail={selectedDetail}
                headingRef={inspectorHeading}
                showCommands={false}
              />
            ) : (
              <div className="p-6" aria-live="polite">
                {selectedDetailLoading
                  ? labels.inspectorLoading
                  : labels.errorTitle}
              </div>
            )}
          </SheetPanel>
          <SheetFooter>
            <Button variant="outline" onClick={closeInspector}>
              {labels.closeInspector}
            </Button>
            {search.incidentId ? (
              <Button
                render={
                  <Link
                    to="/relayops/$workspaceId/incidents/$incidentId"
                    params={{
                      workspaceId,
                      incidentId: search.incidentId,
                    }}
                  />
                }
              >
                <ExternalLink />
                {labels.openRoom}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetPopup>
      </Sheet>
    </div>
  );
}
