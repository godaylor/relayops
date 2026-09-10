import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RelayOpsOverview } from "@/fetchers/relayops";
import { getRelayOpsLocale, relayOpsElapsedParts } from "@/lib/relayops-format";

type ActiveIncident = RelayOpsOverview["activeIncidents"][number];

const statusKeys = {
  detected: "relayops:status.detected",
  triaging: "relayops:status.triaging",
  mitigating: "relayops:status.mitigating",
  monitoring: "relayops:status.monitoring",
  resolved: "relayops:status.resolved",
  dismissed: "relayops:status.dismissed",
} as const;

const severityTone = {
  unknown: "border-current",
  sev1: "border-[#b73a34]",
  sev2: "border-[#b73a34]",
  sev3: "border-[#b9651b]",
  sev4: "border-[#245ebe]",
} as const;

export function LiveIncidentClockRail({
  workspaceId,
  incidents,
  loading = false,
  error = false,
  onRetry,
}: {
  workspaceId: string;
  incidents: ActiveIncident[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (incidents.length === 0) return;
    const timer = globalThis.setInterval(() => setNow(Date.now()), 30_000);
    return () => globalThis.clearInterval(timer);
  }, [incidents.length]);

  return (
    <aside
      className="relayops-clock-rail border-b border-white/15 bg-[#17211f] text-[#f4f6f5]"
      aria-labelledby="relayops-clock-rail-title"
      aria-busy={loading}
    >
      <div className="mx-auto flex max-w-[92rem] min-w-0 flex-col items-stretch gap-2 px-4 sm:flex-row sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 border-white/15 py-2 sm:shrink-0 sm:border-r sm:pr-4">
          <Clock3 className="size-4 text-[#9bbcf3]" aria-hidden="true" />
          <h2
            id="relayops-clock-rail-title"
            className="font-mono font-semibold text-[0.7rem] uppercase tracking-[0.16em]"
          >
            {t("relayops:clockRail.title")}
          </h2>
        </div>

        {loading ? (
          <div
            className="flex min-h-14 flex-1 items-center gap-2"
            role="status"
          >
            <span className="size-2 animate-pulse rounded-full bg-[#9bbcf3] motion-reduce:animate-none" />
            <span className="text-white/70 text-xs">
              {t("relayops:clockRail.loading")}
            </span>
          </div>
        ) : error ? (
          <div
            className="flex min-h-14 flex-1 items-center justify-between gap-3 text-xs"
            role="alert"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle
                className="size-4 text-[#f0b77f]"
                aria-hidden="true"
              />
              {t("relayops:clockRail.error")}
            </span>
            {onRetry ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded border border-white/30 px-3 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={onRetry}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t("relayops:clockRail.retry")}
              </button>
            ) : null}
          </div>
        ) : incidents.length === 0 ? (
          <p className="flex min-h-14 flex-1 items-center text-white/70 text-xs">
            {t("relayops:clockRail.empty")}
          </p>
        ) : (
          <ol
            className="flex min-w-0 flex-1 snap-x items-stretch gap-2 overflow-x-auto py-2"
            aria-live="polite"
          >
            {incidents.map((incident) => {
              const elapsed = relayOpsElapsedParts(incident.detectedAt, now);
              const number = new Intl.NumberFormat(getRelayOpsLocale());
              const elapsedLabel =
                elapsed.hours > 0
                  ? t("relayops:clockRail.elapsedHoursMinutes", {
                      hours: number.format(elapsed.hours),
                      minutes: number.format(elapsed.minutes),
                    })
                  : t("relayops:clockRail.elapsedMinutes", {
                      minutes: number.format(elapsed.minutes),
                    });
              const status = t(statusKeys[incident.status]);
              const severity = incident.severity.toUpperCase();
              return (
                <li
                  key={incident.id}
                  className="min-w-[15rem] max-w-[19rem] flex-1 snap-start"
                >
                  <Link
                    to="/relayops/$workspaceId/incidents/$incidentId"
                    params={{ workspaceId, incidentId: incident.id }}
                    aria-label={t("relayops:clockRail.openIncident", {
                      key: incident.key,
                      title: incident.title,
                      severity,
                      status,
                      elapsed: elapsedLabel,
                    })}
                    className={`grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-2 rounded border border-white/15 border-l-[3px] bg-white/[.06] px-3 py-2 hover:bg-white/[.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${severityTone[incident.severity]}`}
                  >
                    <span
                      className="font-mono font-semibold text-[0.68rem]"
                      translate="no"
                    >
                      {severity}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block truncate font-medium text-xs"
                        title={incident.title}
                      >
                        {incident.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.68rem] text-white/65">
                        <span className="font-mono" translate="no">
                          {incident.key}
                        </span>{" "}
                        · {status}
                      </span>
                    </span>
                    <time
                      dateTime={new Date(incident.detectedAt).toISOString()}
                      className="font-mono text-[0.7rem] tabular-nums text-white/80"
                    >
                      {elapsedLabel}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
