import { ChartNoAxesCombined } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RelayOpsReliabilityAnalytics } from "@/fetchers/relayops-analytics";
import { getRelayOpsLocale } from "@/lib/relayops-format";

export function VolumeChart({
  series,
  onDrilldown,
}: {
  series: RelayOpsReliabilityAnalytics["series"];
  onDrilldown: (bucket: string) => void;
}) {
  const { t } = useTranslation();
  const maximum = Math.max(1, ...series.map((item) => item.volume));
  const number = new Intl.NumberFormat(getRelayOpsLocale());
  const day = new Intl.DateTimeFormat(getRelayOpsLocale(), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  if (!series.some((item) => item.volume > 0)) {
    return (
      <div className="sbor-volume-empty" role="status">
        <ChartNoAxesCombined size={30} aria-hidden="true" />
        <p>{t("relayops:analytics.empty")}</p>
      </div>
    );
  }

  return (
    <div className="sbor-volume-chart">
      <ul className="sbor-volume-columns">
        {series.map((item) => (
          <li key={item.bucket}>
            <button
              type="button"
              className="sbor-volume-bucket"
              data-empty={item.volume === 0}
              aria-label={t("relayops:analytics.openBucket", {
                date: day.format(new Date(`${item.bucket}T12:00:00Z`)),
                count: item.volume,
              })}
              onClick={() => onDrilldown(item.bucket)}
            >
              <span className="sbor-volume-track" aria-hidden="true">
                <span className="sbor-volume-value">
                  {number.format(item.volume)}
                </span>
                <span
                  className="sbor-volume-bar"
                  style={{
                    height: `${item.volume === 0 ? 2 : Math.max(4, (item.volume / maximum) * 160)}px`,
                  }}
                />
              </span>
              <time dateTime={item.bucket}>
                {day.format(new Date(`${item.bucket}T12:00:00Z`))}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
