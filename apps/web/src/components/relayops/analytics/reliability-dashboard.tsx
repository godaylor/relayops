import { Download, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { RelayOpsReliabilityAnalytics } from "@/fetchers/relayops-analytics";
import type { ReliabilityAnalyticsSearch } from "@/lib/relayops-analytics-search";
import { getRelayOpsLocale } from "@/lib/relayops-format";
import {
  relayOpsIncidentStatuses,
  relayOpsSeverities,
} from "@/lib/relayops-workbench-search";

type ServiceOption = { id: string; name: string };

type ReliabilityDashboardProps = {
  data: RelayOpsReliabilityAnalytics;
  search: ReliabilityAnalyticsSearch;
  services: ServiceOption[];
  canExport: boolean;
  isExporting?: boolean;
  onSearchChange: (search: ReliabilityAnalyticsSearch) => void;
  onDrilldown: (bucket: string) => void;
  onExport: () => void;
};

function duration(value: number | null) {
  if (value === null) return "—";
  const seconds = Math.round(value / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

function rate(value: number | null) {
  return value === null ? "—" : `${value.toFixed(value % 1 ? 1 : 0)}%`;
}

function MetricCard({
  label,
  value,
  detail,
  comparison,
}: {
  label: string;
  value: string;
  detail: string;
  comparison?: string;
}) {
  return (
    <article className="rounded-lg border border-[#17211f]/10 bg-white p-4 dark:border-white/10 dark:bg-[#101a18]">
      <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-2 font-semibold text-3xl tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      {comparison ? (
        <p className="mt-3 border-[#17211f]/8 border-t pt-2 text-muted-foreground text-xs dark:border-white/10">
          {comparison}
        </p>
      ) : null}
    </article>
  );
}

const selectClassName =
  "min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/24";

export function ReliabilityDashboard({
  data,
  search,
  services,
  canExport,
  isExporting = false,
  onSearchChange,
  onDrilldown,
  onExport,
}: ReliabilityDashboardProps) {
  const { t } = useTranslation();
  const maxVolume = Math.max(1, ...data.series.map((item) => item.volume));
  const compare = data.comparison?.metrics;
  const metricCards = [
    {
      label: t("relayops:analytics.volume"),
      value: String(data.metrics.volume.count),
      detail: t("relayops:analytics.incidentsInPeriod"),
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: compare.volume.count,
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.mtta"),
      value: duration(data.metrics.mtta.p50Ms),
      detail: t("relayops:analytics.sampleDetail", {
        sample: data.metrics.mtta.sampleSize,
        missing: data.metrics.mtta.excludedMissing,
      }),
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: duration(compare.mtta.p50Ms),
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.mttr"),
      value: duration(data.metrics.mttr.p50Ms),
      detail: t("relayops:analytics.p90", {
        value: duration(data.metrics.mttr.p90Ms),
      }),
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: duration(compare.mttr.p50Ms),
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.mitigation"),
      value: duration(data.metrics.mitigation.p50Ms),
      detail: t("relayops:analytics.p90", {
        value: duration(data.metrics.mitigation.p90Ms),
      }),
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: duration(compare.mitigation.p50Ms),
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.reopen"),
      value: rate(data.metrics.reopen.percent),
      detail: `${data.metrics.reopen.numerator} / ${data.metrics.reopen.denominator}`,
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: rate(compare.reopen.percent),
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.stale"),
      value: rate(data.metrics.stale.percent),
      detail: t("relayops:analytics.staleDetail", {
        stale: data.metrics.stale.numerator,
        active: data.metrics.stale.denominator,
      }),
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: rate(compare.stale.percent),
          })
        : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-[#17211f]/10 border-b pb-5 dark:border-white/10 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[#245ebe] text-xs tracking-[0.18em] dark:text-[#8fb6ff]">
            {t("relayops:analytics.eyebrow")}
          </p>
          <h1 className="mt-2 font-semibold text-3xl tracking-tight sm:text-4xl">
            {t("relayops:analytics.title")}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {t("relayops:analytics.description")}
          </p>
        </div>
        {canExport ? (
          <Button
            type="button"
            variant="outline"
            loading={isExporting}
            onClick={onExport}
          >
            <Download aria-hidden="true" />
            {t("relayops:analytics.export")}
          </Button>
        ) : null}
      </header>

      <section
        aria-labelledby="reliability-filters"
        className="rounded-xl border border-[#17211f]/10 bg-white p-4 dark:border-white/10 dark:bg-[#101a18]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="reliability-filters" className="font-semibold text-lg">
            {t("relayops:analytics.filters")}
          </h2>
          <p className="font-mono text-muted-foreground text-xs">
            {search.timezone} · {data.definition.version}
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Field>
            <FieldLabel>{t("relayops:analytics.from")}</FieldLabel>
            <Input
              type="date"
              value={search.from}
              max={search.to}
              onChange={(event) =>
                onSearchChange({ ...search, from: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel>{t("relayops:analytics.to")}</FieldLabel>
            <Input
              type="date"
              value={search.to}
              min={search.from}
              onChange={(event) =>
                onSearchChange({ ...search, to: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="reliability-status">
              {t("relayops:analytics.status")}
            </FieldLabel>
            <select
              id="reliability-status"
              className={selectClassName}
              value={search.status[0] ?? ""}
              onChange={(event) =>
                onSearchChange({
                  ...search,
                  status: event.target.value
                    ? [event.target.value as (typeof search.status)[number]]
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
              value={search.severity[0] ?? ""}
              onChange={(event) =>
                onSearchChange({
                  ...search,
                  severity: event.target.value
                    ? [event.target.value as (typeof search.severity)[number]]
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
              value={search.service[0] ?? ""}
              onChange={(event) =>
                onSearchChange({
                  ...search,
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
                checked={search.compare}
                onChange={(event) =>
                  onSearchChange({ ...search, compare: event.target.checked })
                }
                className="size-4 accent-[#245ebe]"
              />
              {t("relayops:analytics.compare")}
            </label>
          </div>
        </div>
      </section>

      <section aria-labelledby="reliability-metrics">
        <h2 id="reliability-metrics" className="sr-only">
          {t("relayops:analytics.metrics")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metricCards.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
        <details className="mt-3 rounded-lg border border-[#17211f]/10 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-[#101a18]">
          <summary className="cursor-pointer font-medium">
            {t("relayops:analytics.metrics")} · {data.definition.version}
          </summary>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(data.definition.formulas).map(
              ([metric, formula]) => (
                <div key={metric}>
                  <dt className="font-mono text-muted-foreground text-xs uppercase">
                    {metric}
                  </dt>
                  <dd className="mt-1">{formula}</dd>
                </div>
              ),
            )}
          </dl>
        </details>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.8fr)]">
        <article className="rounded-xl border border-[#17211f]/10 bg-white p-4 dark:border-white/10 dark:bg-[#101a18]">
          <h2 className="font-semibold text-xl">
            {t("relayops:analytics.volumeTrend")}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("relayops:analytics.drilldownHint")}
          </p>
          {data.series.length > 0 ? (
            <ul className="mt-5 flex min-h-48 items-end gap-1 overflow-x-auto border-[#17211f]/8 border-b pb-2 dark:border-white/10">
              {data.series.map((item) => (
                <li
                  key={item.bucket}
                  className="flex min-w-11 flex-1 items-end"
                >
                  <button
                    type="button"
                    className="group flex min-h-11 w-full items-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245ebe]"
                    aria-label={t("relayops:analytics.openBucket", {
                      date: item.bucket,
                      count: item.volume,
                    })}
                    onClick={() => onDrilldown(item.bucket)}
                  >
                    <span
                      aria-hidden="true"
                      className="flex w-full min-w-5 items-start justify-center rounded-sm bg-[#245ebe] pt-1 font-mono text-[0.62rem] text-white transition-colors group-hover:bg-[#184a9c]"
                      style={{
                        height: `${Math.max(14, (item.volume / maxVolume) * 176)}px`,
                      }}
                    >
                      {item.volume}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
              {t("relayops:analytics.empty")}
            </p>
          )}
        </article>

        <article className="rounded-xl border border-[#17211f]/10 bg-[#17211f] p-4 text-white dark:border-white/10">
          <p className="font-mono text-[#8fb6ff] text-xs tracking-[0.16em]">
            {t("relayops:analytics.hotspotEyebrow")}
          </p>
          <h2 className="mt-2 font-semibold text-xl">
            {t("relayops:analytics.hotspots")}
          </h2>
          <p className="mt-1 text-sm text-white/65">
            {t("relayops:analytics.primaryServiceOnly")}
          </p>
          <ol className="mt-5 space-y-3">
            {data.hotspots.map((hotspot, index) => (
              <li
                key={hotspot.serviceId}
                className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-white/10 border-t pt-3"
              >
                <span className="font-mono text-white/45 text-xs">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 truncate font-medium">
                  {hotspot.serviceName}
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {hotspot.incidentCount}
                </span>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section
        aria-labelledby="reliability-table"
        className="rounded-xl border border-[#17211f]/10 bg-white p-4 dark:border-white/10 dark:bg-[#101a18]"
      >
        <div className="flex items-center gap-2">
          <h2 id="reliability-table" className="font-semibold text-xl">
            {t("relayops:analytics.tableTitle")}
          </h2>
          <ExternalLink
            aria-hidden="true"
            className="size-4 text-[#245ebe] dark:text-[#8fb6ff]"
          />
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          {t("relayops:analytics.tableDescription")}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-[#17211f]/10 border-b dark:border-white/10">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("relayops:analytics.date")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("relayops:analytics.volume")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("relayops:analytics.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((item) => (
                <tr
                  key={item.bucket}
                  className="border-[#17211f]/8 border-b last:border-0 dark:border-white/8"
                >
                  <th scope="row" className="px-3 py-2 font-mono font-normal">
                    {item.bucket}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.volume}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDrilldown(item.bucket)}
                    >
                      {t("relayops:analytics.openWorkbench")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 font-mono text-muted-foreground text-xs">
          {t("relayops:analytics.generatedAt", {
            value: new Intl.DateTimeFormat(getRelayOpsLocale(), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: search.timezone,
            }).format(new Date(data.generatedAt)),
          })}
        </p>
      </section>
    </div>
  );
}
