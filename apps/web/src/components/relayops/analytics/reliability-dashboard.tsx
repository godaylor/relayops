import {
  Activity,
  ArrowUpRight,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Gauge,
  RotateCcw,
  Timer,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { Button } from "@/components/ui/button";
import type { RelayOpsReliabilityAnalytics } from "@/fetchers/relayops-analytics";
import type { ReliabilityAnalyticsSearch } from "@/lib/relayops-analytics-search";
import { getRelayOpsLocale } from "@/lib/relayops-format";
import { ReliabilityFilters } from "./reliability-filters";
import { VolumeChart } from "./volume-chart";
import "../service-analytics.css";

type ServiceOption = { id: string; name: string };

type ReliabilityDashboardProps = {
  data?: RelayOpsReliabilityAnalytics;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  search: ReliabilityAnalyticsSearch;
  services: ServiceOption[];
  canExport: boolean;
  isExporting?: boolean;
  onSearchChange: (search: ReliabilityAnalyticsSearch) => void;
  onDrilldown: (bucket: string) => void;
  onExport: () => void;
  onServiceOpen?: (serviceId: string) => void;
};

function duration(value: number | null) {
  if (value === null) return "—";
  const seconds = Math.round(value / 1_000);
  const format = (amount: number, unit: "second" | "minute" | "hour") =>
    new Intl.NumberFormat(getRelayOpsLocale(), {
      style: "unit",
      unit,
      unitDisplay: "narrow",
      maximumFractionDigits: 1,
    }).format(amount);
  if (seconds < 60) return format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return format(minutes, "minute");
  const hours = minutes / 60;
  return format(
    hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours),
    "hour",
  );
}

function rate(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat(getRelayOpsLocale(), {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value / 100);
}

function MetricCard({
  label,
  value,
  detail,
  comparison,
  sample,
  icon: Icon,
  primary,
}: {
  label: string;
  value: string;
  detail: string;
  comparison?: string;
  sample?: string;
  icon: typeof Activity;
  primary?: boolean;
}) {
  return (
    <article className="sbor-reliability-metric" data-primary={primary}>
      <span className="sbor-reliability-metric-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <p className="sbor-reliability-metric-label">{label}</p>
      <p className="sbor-reliability-metric-value">{value}</p>
      <p className="sbor-reliability-metric-detail">{detail}</p>
      {sample ? (
        <p className="sbor-reliability-metric-detail">{sample}</p>
      ) : null}
      {comparison ? (
        <p className="mt-3 border-[#1b1d36]/8 border-t pt-2 text-muted-foreground text-xs dark:border-white/10">
          {comparison}
        </p>
      ) : null}
    </article>
  );
}

export function ReliabilityDashboard({
  data,
  loading = false,
  error,
  onRetry = () => undefined,
  search,
  services,
  canExport,
  isExporting = false,
  onSearchChange,
  onDrilldown,
  onExport,
  onServiceOpen,
}: ReliabilityDashboardProps) {
  const { t } = useTranslation();

  return (
    <div className="sbor-analytics space-y-6">
      <header className="sbor-surface-header">
        <div>
          <p className="font-mono text-[#6757ec] text-xs tracking-[0.18em] dark:text-[#b3a5ff]">
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
            disabled={loading || Boolean(error) || !data}
            onClick={onExport}
          >
            <Download aria-hidden="true" />
            {t("relayops:analytics.export")}
          </Button>
        ) : null}
      </header>

      <ReliabilityFilters
        search={search}
        services={services}
        onSearchChange={onSearchChange}
      />
      {loading ? (
        <RelayOpsSkeleton rows={8} />
      ) : error || !data ? (
        <RelayOpsErrorState error={error} onRetry={onRetry} />
      ) : (
        <ReliabilityResults
          data={data}
          search={search}
          onDrilldown={onDrilldown}
          onServiceOpen={onServiceOpen}
        />
      )}
    </div>
  );
}

function ReliabilityResults({
  data,
  search,
  onDrilldown,
  onServiceOpen,
}: {
  data: RelayOpsReliabilityAnalytics;
  search: ReliabilityAnalyticsSearch;
  onDrilldown: (bucket: string) => void;
  onServiceOpen?: (serviceId: string) => void;
}) {
  const { t } = useTranslation();
  const compare = data.comparison?.metrics;
  const number = new Intl.NumberFormat(getRelayOpsLocale());
  const metricCards = [
    {
      label: t("relayops:analytics.volume"),
      value: number.format(data.metrics.volume.count),
      detail: t("relayops:analytics.incidentsInPeriod"),
      icon: Activity,
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: compare.volume.count,
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.mtta"),
      icon: Timer,
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
      icon: CheckCircle2,
      value: duration(data.metrics.mttr.p50Ms),
      detail: t("relayops:analytics.p90", {
        value: duration(data.metrics.mttr.p90Ms),
      }),
      sample: t("relayops:analytics.sampleDetail", {
        sample: data.metrics.mttr.sampleSize,
        missing: data.metrics.mttr.excludedMissing,
      }),
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: duration(compare.mttr.p50Ms),
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.mitigation"),
      icon: Gauge,
      value: duration(data.metrics.mitigation.p50Ms),
      detail: t("relayops:analytics.p90", {
        value: duration(data.metrics.mitigation.p90Ms),
      }),
      sample: t("relayops:analytics.sampleDetail", {
        sample: data.metrics.mitigation.sampleSize,
        missing: data.metrics.mitigation.excludedMissing,
      }),
      comparison: compare
        ? t("relayops:analytics.previousValue", {
            value: duration(compare.mitigation.p50Ms),
          })
        : undefined,
    },
    {
      label: t("relayops:analytics.reopen"),
      icon: RotateCcw,
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
      icon: Clock3,
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
    <>
      <section aria-labelledby="reliability-metrics">
        <h2 id="reliability-metrics" className="sr-only">
          {t("relayops:analytics.metrics")}
        </h2>
        <div className="sbor-reliability-metrics">
          {metricCards.map((metric, index) => (
            <MetricCard key={metric.label} {...metric} primary={index < 3} />
          ))}
        </div>
        <details className="mt-3 rounded-lg border bg-background p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            {t("relayops:analytics.explanation")}
          </summary>
          <p className="mt-3 max-w-3xl">
            {t("relayops:analytics.explanationBody")}
          </p>
        </details>
      </section>

      <section className="sbor-reliability-charts">
        <article className="sbor-volume-panel">
          <h2 className="font-semibold text-xl">
            {t("relayops:analytics.volumeTrend")}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("relayops:analytics.drilldownHint")}
          </p>
          <VolumeChart series={data.series} onDrilldown={onDrilldown} />
        </article>

        <article className="sbor-hotspots-panel">
          <p className="font-mono text-[#b3a5ff] text-xs tracking-[0.16em]">
            {t("relayops:analytics.hotspotEyebrow")}
          </p>
          <h2 className="mt-2 font-semibold text-xl">
            {t("relayops:analytics.hotspots")}
          </h2>
          <p className="mt-1 text-sm text-white/65">
            {t("relayops:analytics.primaryServiceOnly")}
          </p>
          {data.hotspots.length === 0 ? (
            <div className="sbor-hotspots-empty">
              <ChartNoAxesCombined size={26} aria-hidden="true" />
              <p>{t("relayops:analytics.empty")}</p>
            </div>
          ) : (
            <ol className="mt-5 space-y-3">
              {data.hotspots.map((hotspot, index) => (
                <li
                  key={hotspot.serviceId}
                  className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-white/10 border-t pt-3"
                >
                  <span className="font-mono text-white/45 text-xs">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {onServiceOpen ? (
                    <button
                      type="button"
                      className="sbor-hotspot-service"
                      onClick={() => onServiceOpen(hotspot.serviceId)}
                    >
                      {hotspot.serviceName}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="min-w-0 break-words font-medium">
                      {hotspot.serviceName}
                    </span>
                  )}
                  <span className="font-mono text-sm tabular-nums">
                    {number.format(hotspot.incidentCount)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>

      <section
        aria-labelledby="reliability-table"
        className="sbor-reliability-table rounded-xl border border-[#1b1d36]/10 bg-white p-4 dark:border-white/10 dark:bg-[#1a1c35]"
      >
        <div className="flex items-center gap-2">
          <h2 id="reliability-table" className="font-semibold text-xl">
            {t("relayops:analytics.tableTitle")}
          </h2>
          <ExternalLink
            aria-hidden="true"
            className="size-4 text-[#6757ec] dark:text-[#b3a5ff]"
          />
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          {t("relayops:analytics.tableDescription")}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-[#1b1d36]/10 border-b dark:border-white/10">
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
              {data.series.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-muted-foreground">
                    {t("relayops:analytics.empty")}
                  </td>
                </tr>
              ) : null}
              {data.series.map((item) => (
                <tr
                  key={item.bucket}
                  className="border-[#1b1d36]/8 border-b last:border-0 dark:border-white/8"
                >
                  <th scope="row" className="px-3 py-2 font-mono font-normal">
                    <time dateTime={item.bucket}>
                      {new Intl.DateTimeFormat(getRelayOpsLocale(), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }).format(new Date(`${item.bucket}T12:00:00Z`))}
                    </time>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {number.format(item.volume)}
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
    </>
  );
}
