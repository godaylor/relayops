import { Bookmark, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  parseWorkbenchSearch,
  type WorkbenchSearch,
} from "@/lib/relayops-workbench-search";
import type {
  SavedViewConflict,
  WorkbenchFacetValue,
  WorkbenchLabels,
  WorkbenchSavedView,
} from "./types";
import { WorkbenchColumnConfiguration } from "./virtualized-incident-table";

function selectedValues(element: HTMLSelectElement) {
  return Array.from(element.selectedOptions, (option) => option.value);
}

function FacetSelect({
  id,
  label,
  values,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  values: WorkbenchFacetValue[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="grid gap-1 text-muted-foreground text-xs">
      {label}
      <select
        id={id}
        multiple
        value={selected}
        className="min-h-20 rounded-lg border bg-background px-2 py-1 text-foreground text-sm"
        onChange={(event) => onChange(selectedValues(event.currentTarget))}
      >
        {values.map((value) => (
          <option key={value.value} value={value.value}>
            {value.label} ({value.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function SavedViewControls({
  search,
  labels,
  savedViews,
  conflict,
  onSearchChange,
  onCreate,
  onUpdate,
  onUseCurrent,
  onRetryDraft,
}: {
  search: WorkbenchSearch;
  labels: WorkbenchLabels;
  savedViews: WorkbenchSavedView[];
  conflict?: SavedViewConflict;
  onSearchChange: (search: WorkbenchSearch) => void;
  onCreate?: (name: string, visibility: "private" | "workspace") => void;
  onUpdate?: (view: WorkbenchSavedView) => void;
  onUseCurrent?: (view: WorkbenchSavedView) => void;
  onRetryDraft?: (conflict: SavedViewConflict) => void;
}) {
  const active = savedViews.find((view) => view.id === search.view);

  return (
    <section className="rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-48 flex-1 gap-1 text-muted-foreground text-xs">
          {labels.savedViews}
          <select
            value={search.view ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-foreground text-sm"
            onChange={(event) =>
              onSearchChange({
                ...search,
                view: event.target.value || undefined,
              })
            }
          >
            <option value="">{labels.unsavedView}</option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        {active && onUpdate ? (
          <Button variant="outline" onClick={() => onUpdate(active)}>
            <RefreshCw />
            {labels.updateSavedView}
          </Button>
        ) : null}
      </div>
      {onCreate ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = String(data.get("saved-view-name") ?? "").trim();
            const visibility =
              data.get("saved-view-visibility") === "workspace"
                ? "workspace"
                : "private";
            if (name) onCreate(name, visibility);
          }}
        >
          <label
            htmlFor="saved-view-name"
            className="grid gap-1 text-muted-foreground text-xs"
          >
            {labels.viewName}
            <Input
              id="saved-view-name"
              name="saved-view-name"
              maxLength={120}
              required
            />
          </label>
          <label className="grid gap-1 text-muted-foreground text-xs">
            {labels.savedViews}
            <select
              name="saved-view-visibility"
              className="h-9 rounded-lg border bg-background px-2 text-foreground text-sm"
              defaultValue="private"
            >
              <option value="private">{labels.privateVisibility}</option>
              <option value="workspace">{labels.workspaceVisibility}</option>
            </select>
          </label>
          <Button className="self-end" type="submit">
            <Bookmark />
            {labels.saveCurrentView}
          </Button>
        </form>
      ) : null}
      {conflict ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-[#b9651b]/35 bg-[#b9651b]/8 p-3"
        >
          <h3 className="font-semibold">{labels.conflictTitle}</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {labels.conflictDescription}
          </p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{labels.conflictDraft}</dt>
              <dd>
                {conflict.draftName} · v{conflict.expectedVersion}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {labels.conflictCurrent}
              </dt>
              <dd>
                {conflict.current.name} · v{conflict.current.version}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            {onUseCurrent ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUseCurrent(conflict.current)}
              >
                {labels.useCurrent}
              </Button>
            ) : null}
            {onRetryDraft ? (
              <Button size="sm" onClick={() => onRetryDraft(conflict)}>
                {labels.retryDraft}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function WorkbenchToolbar({
  search,
  labels,
  facets,
  onChange,
}: {
  search: WorkbenchSearch;
  labels: WorkbenchLabels;
  facets: {
    status: WorkbenchFacetValue[];
    severity: WorkbenchFacetValue[];
  };
  onChange: (search: WorkbenchSearch) => void;
}) {
  return (
    <section className="rounded-xl border bg-background p-3">
      <form
        className="flex flex-wrap items-end gap-2"
        aria-label={labels.searchLabel}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onChange({
            ...search,
            q: String(data.get("workbench-q") ?? "")
              .trim()
              .slice(0, 200),
            from: String(data.get("workbench-from") ?? search.from),
            to: String(data.get("workbench-to") ?? search.to),
          });
        }}
      >
        <label
          htmlFor="workbench-q"
          className="grid min-w-64 flex-1 gap-1 text-muted-foreground text-xs"
        >
          {labels.searchLabel}
          <Input
            key={search.q}
            id="workbench-q"
            name="workbench-q"
            type="search"
            defaultValue={search.q}
            placeholder={labels.searchPlaceholder}
            maxLength={200}
          />
        </label>
        <label
          htmlFor="workbench-from"
          className="grid gap-1 text-muted-foreground text-xs"
        >
          {labels.from}
          <Input
            id="workbench-from"
            name="workbench-from"
            type="date"
            defaultValue={search.from}
          />
        </label>
        <label
          htmlFor="workbench-to"
          className="grid gap-1 text-muted-foreground text-xs"
        >
          {labels.to}
          <Input
            id="workbench-to"
            name="workbench-to"
            type="date"
            defaultValue={search.to}
          />
        </label>
        <Button type="submit">
          <Search />
          {labels.applyFilters}
        </Button>
        <Button
          variant="outline"
          onClick={() => onChange(parseWorkbenchSearch({}))}
        >
          {labels.clearFilters}
        </Button>
      </form>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
        <FacetSelect
          id="workbench-status"
          label={labels.statusFilter}
          values={facets.status.map((facet) => ({
            ...facet,
            label:
              labels.statusById[
                facet.value as keyof typeof labels.statusById
              ] ?? facet.label,
          }))}
          selected={search.status}
          onChange={(status) =>
            onChange({
              ...search,
              status: status as WorkbenchSearch["status"],
            })
          }
        />
        <FacetSelect
          id="workbench-severity"
          label={labels.severityFilter}
          values={facets.severity.map((facet) => ({
            ...facet,
            label:
              labels.severityById[
                facet.value as keyof typeof labels.severityById
              ] ?? facet.label,
          }))}
          selected={search.severity}
          onChange={(severity) =>
            onChange({
              ...search,
              severity: severity as WorkbenchSearch["severity"],
            })
          }
        />
        <label className="grid gap-1 text-muted-foreground text-xs">
          {labels.group}
          <select
            value={search.group}
            className="h-9 rounded-lg border bg-background px-2 text-foreground text-sm"
            onChange={(event) =>
              onChange({
                ...search,
                group: event.target.value as WorkbenchSearch["group"],
              })
            }
          >
            {Object.entries(labels.groupsById).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-muted-foreground text-xs">
          {labels.density}
          <select
            value={search.density}
            className="h-9 rounded-lg border bg-background px-2 text-foreground text-sm"
            onChange={(event) =>
              onChange({
                ...search,
                density: event.target.value as WorkbenchSearch["density"],
              })
            }
          >
            <option value="compact">{labels.compact}</option>
            <option value="comfortable">{labels.comfortable}</option>
          </select>
        </label>
        <div className="self-end">
          <WorkbenchColumnConfiguration
            columns={search.columns}
            labels={labels}
            onChange={(columns) => onChange({ ...search, columns })}
          />
        </div>
      </div>
    </section>
  );
}
