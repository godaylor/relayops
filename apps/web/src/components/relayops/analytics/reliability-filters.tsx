import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  parseReliabilityAnalyticsSearch,
  type ReliabilityAnalyticsSearch,
  serializeReliabilityAnalyticsSearch,
} from "@/lib/relayops-analytics-search";
import {
  relayOpsIncidentStatuses,
  relayOpsSeverities,
} from "@/lib/relayops-workbench-search";

const selectClassName =
  "min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/24";

export function ReliabilityFilters({
  search,
  services,
  onSearchChange,
}: {
  search: ReliabilityAnalyticsSearch;
  services: { id: string; name: string }[];
  onSearchChange: (search: ReliabilityAnalyticsSearch) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(search);
  const applied = serializeReliabilityAnalyticsSearch(search);
  const submitted = useRef<string | null>(null);
  useEffect(() => {
    const ownSubmission = submitted.current;
    submitted.current = null;
    if (ownSubmission === applied) return;
    setDraft(
      parseReliabilityAnalyticsSearch(
        Object.fromEntries(new URLSearchParams(applied)),
      ),
    );
  }, [applied]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = serializeReliabilityAnalyticsSearch(draft);
    submitted.current = next !== applied ? next : null;
    onSearchChange(draft);
  }

  return (
    <form
      onSubmit={apply}
      aria-labelledby="reliability-filters"
      className="sbor-reliability-filters rounded-xl border border-[#1b1d36]/10 bg-white p-4 dark:border-white/10 dark:bg-[#1a1c35]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reliability-filters" className="font-semibold text-lg">
          {t("relayops:analytics.filters")}
        </h2>
        <p className="font-mono text-muted-foreground text-xs">
          {draft.timezone}
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Field>
          <FieldLabel htmlFor="reliability-from">
            {t("relayops:analytics.from")}
          </FieldLabel>
          <Input
            type="date"
            id="reliability-from"
            required
            value={draft.from}
            max={draft.to}
            onChange={(event) =>
              setDraft({ ...draft, from: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="reliability-to">
            {t("relayops:analytics.to")}
          </FieldLabel>
          <Input
            type="date"
            id="reliability-to"
            required
            value={draft.to}
            min={draft.from}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="reliability-status">
            {t("relayops:analytics.status")}
          </FieldLabel>
          <select
            id="reliability-status"
            className={selectClassName}
            value={draft.status[0] ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                status: event.target.value
                  ? [event.target.value as (typeof draft.status)[number]]
                  : [],
              })
            }
          >
            <option value="">{t("relayops:analytics.all")}</option>
            {relayOpsIncidentStatuses.map((status) => (
              <option key={status} value={status}>
                {t(`relayops:status.${status}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="reliability-severity">
            {t("relayops:analytics.severity")}
          </FieldLabel>
          <select
            id="reliability-severity"
            className={selectClassName}
            value={draft.severity[0] ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                severity: event.target.value
                  ? [event.target.value as (typeof draft.severity)[number]]
                  : [],
              })
            }
          >
            <option value="">{t("relayops:analytics.all")}</option>
            {relayOpsSeverities.map((severity) => (
              <option key={severity} value={severity}>
                {t(`relayops:severity.${severity}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="reliability-service">
            {t("relayops:analytics.service")}
          </FieldLabel>
          <select
            id="reliability-service"
            className={selectClassName}
            value={draft.service[0] ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                service: event.target.value ? [event.target.value] : [],
              })
            }
          >
            <option value="">{t("relayops:analytics.all")}</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex min-h-10 items-end pb-1">
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.compare}
              onChange={(event) =>
                setDraft({ ...draft, compare: event.target.checked })
              }
              className="size-4 accent-[#6757ec]"
            />
            {t("relayops:analytics.compare")}
          </label>
        </div>
      </div>
      <div className="sbor-analytics-demo-policy mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.includeDemo}
            aria-describedby="analytics-demo-policy"
            onChange={(event) =>
              setDraft({ ...draft, includeDemo: event.target.checked })
            }
            className="size-4 accent-[#6757ec]"
          />
          {t("relayops:analytics.includeDemo")}
        </label>
        <p
          id="analytics-demo-policy"
          className="max-w-xl text-muted-foreground text-xs leading-5"
        >
          {t(
            draft.includeDemo
              ? "relayops:analytics.demoIncluded"
              : "relayops:analytics.demoExcluded",
          )}
        </p>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit">{t("relayops:catalog.apply")}</Button>
      </div>
    </form>
  );
}
