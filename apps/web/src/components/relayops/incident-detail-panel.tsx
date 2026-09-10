import { Link } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Radio,
  Server,
  ShieldAlert,
  Users,
} from "lucide-react";
import { type RefObject, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { RelayOpsIncidentDetail } from "@/fetchers/relayops";
import { useRelayOpsPrimaryServiceOwnership } from "@/hooks/relayops/use-relayops-capability";
import { formatRelayOpsDateTime } from "@/lib/relayops-format";
import { IncidentCommandPanel } from "./incident-command-panel";

const statusKeys = {
  detected: "relayops:status.detected",
  triaging: "relayops:status.triaging",
  mitigating: "relayops:status.mitigating",
  monitoring: "relayops:status.monitoring",
  resolved: "relayops:status.resolved",
  dismissed: "relayops:status.dismissed",
} as const;

const impactKeys = {
  unknown: "relayops:impact.unknown",
  none: "relayops:impact.none",
  degraded: "relayops:impact.degraded",
  partial_outage: "relayops:impact.partial_outage",
  full_outage: "relayops:impact.full_outage",
} as const;

const eventKeys = {
  "incident.created": "relayops:timeline.created",
  "incident.status_changed": "relayops:timeline.statusChanged",
  "incident.severity_changed": "relayops:timeline.severityChanged",
  "incident.assignment_changed": "relayops:timeline.assignmentChanged",
  "incident.update_published": "relayops:timeline.updatePublished",
  "incident.timestamps_corrected": "relayops:timeline.timestampsCorrected",
  "incident.resolved": "relayops:timeline.resolved",
  "incident.dismissed": "relayops:timeline.dismissed",
  "incident.reopened": "relayops:timeline.reopened",
} as const;

function TimelineSummary({
  type,
  payload,
}: {
  type: string;
  payload: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const message = typeof payload.message === "string" ? payload.message : null;
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  const key = eventKeys[type as keyof typeof eventKeys];

  return (
    <>
      <p className="mt-2 text-muted-foreground text-sm">
        {key ? t(key) : t("relayops:timeline.fallback")}
      </p>
      {message || reason ? (
        <p className="mt-2 whitespace-pre-wrap text-sm">{message ?? reason}</p>
      ) : null}
    </>
  );
}

function TimestampFact({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm">
        {value
          ? formatRelayOpsDateTime(value)
          : t("relayops:incidentRoom.notRecorded")}
      </dd>
    </div>
  );
}

function DemoChecklist() {
  const { t } = useTranslation();
  const [checked, setChecked] = useState([false, false, false]);
  const labels = [
    t("relayops:incidentRoom.checklistAcknowledge"),
    t("relayops:incidentRoom.checklistOpenRunbook"),
    t("relayops:incidentRoom.checklistPostUpdate"),
  ];

  return (
    <section aria-labelledby="demo-checklist-heading">
      <h2 id="demo-checklist-heading" className="font-semibold">
        {t("relayops:incidentRoom.checklistTitle")}
      </h2>
      <p className="mt-2 text-muted-foreground text-sm">
        {t("relayops:incidentRoom.demoChecklistDescription")}
      </p>
      <div className="mt-4 space-y-2">
        {labels.map((label, index) => (
          <label
            key={label}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 text-sm dark:bg-[#101a18]"
          >
            <input
              type="checkbox"
              checked={checked[index]}
              onChange={(event) =>
                setChecked((current) =>
                  current.map((value, itemIndex) =>
                    itemIndex === index ? event.target.checked : value,
                  ),
                )
              }
              className="size-4 accent-[#245ebe]"
            />
            <span
              className={
                checked[index] ? "text-muted-foreground line-through" : ""
              }
            >
              {label}
            </span>
          </label>
        ))}
        {checked.every(Boolean) ? (
          <p className="flex items-center gap-2 pt-2 text-emerald-700 text-sm">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t("relayops:incidentRoom.checklistComplete")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
export function IncidentDetailPanel({
  workspaceId,
  detail,
  headingRef,
  showCommands = true,
}: {
  workspaceId: string;
  detail: RelayOpsIncidentDetail;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  showCommands?: boolean;
}) {
  const { t } = useTranslation();
  const {
    incident,
    service,
    commander,
    responders,
    affectedServices,
    timeline,
  } = detail;
  const ownership = useRelayOpsPrimaryServiceOwnership(
    workspaceId,
    service.ownerTeamId,
  );

  return (
    <section className="rounded-xl border border-[#17211f]/10 bg-white dark:border-white/10 dark:bg-[#101a18]">
      <div className="border-b p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[#245ebe] text-sm dark:text-[#8fb6ff]">
                {incident.key}
              </span>
              {incident.isDemo ? (
                <Badge className="bg-[#9a4d0d] text-white">
                  {t("relayops:incidentRoom.demoBadge")}
                </Badge>
              ) : null}
              <Badge variant="outline">{t(statusKeys[incident.status])}</Badge>
              <Badge variant="secondary">
                {t(impactKeys[incident.impact as keyof typeof impactKeys])}
              </Badge>
            </div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-3 max-w-4xl font-semibold text-3xl tracking-tight outline-none sm:text-4xl"
            >
              {incident.title}
            </h1>
            {incident.summary ? (
              <p className="mt-3 max-w-3xl text-muted-foreground">
                {incident.summary}
              </p>
            ) : null}
          </div>
          <Badge className="self-start bg-[#b73a34] px-3 py-1.5 text-white">
            {incident.severity.toUpperCase()}
          </Badge>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link
            to="/relayops/$workspaceId/services/$serviceId"
            params={{ workspaceId, serviceId: service.id }}
            className="flex min-h-11 items-center gap-2 text-[#245ebe] hover:underline dark:text-[#8fb6ff]"
          >
            <Server className="size-4" aria-hidden="true" />
            {service.name}
          </Link>
          <span className="flex min-h-11 items-center gap-2 text-muted-foreground">
            <Radio className="size-4" aria-hidden="true" />
            {t("relayops:incidentRoom.authoritative")}
          </span>
          <span className="flex min-h-11 items-center gap-2 text-muted-foreground">
            <Clock3 className="size-4" aria-hidden="true" />
            {t("relayops:incidentRoom.freshness", {
              time: formatRelayOpsDateTime(incident.lastUpdateAt),
            })}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="p-5 sm:p-7" aria-labelledby="timeline-heading">
          <div className="flex items-center gap-2">
            <Activity
              className="size-5 text-[#245ebe] dark:text-[#8fb6ff]"
              aria-hidden="true"
            />
            <h2 id="timeline-heading" className="font-semibold text-xl">
              {t("relayops:timeline.title")}
            </h2>
          </div>
          <div className="relative mt-6 border-l-2 border-[#245ebe]/20 pl-7">
            {timeline.map((event) => (
              <article
                key={event.id}
                className="relative mb-6 rounded-lg border bg-[#f4f6f5] p-4 [content-visibility:auto] last:mb-0 dark:bg-[#0b1210]"
              >
                <span className="absolute top-5 -left-[2.08rem] size-3 rounded-full border-2 border-white bg-[#245ebe] dark:border-[#101a18]" />
                <div className="flex flex-wrap justify-between gap-2">
                  <strong className="font-mono text-sm">{event.type}</strong>
                  <time
                    dateTime={new Date(event.occurredAt).toISOString()}
                    className="text-muted-foreground text-xs"
                  >
                    {formatRelayOpsDateTime(event.occurredAt)}
                  </time>
                </div>
                <TimelineSummary type={event.type} payload={event.payload} />
                <p className="mt-3 font-mono text-muted-foreground text-xs">
                  {t("relayops:incidentRoom.version", {
                    version: event.incidentVersion,
                  })}
                </p>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-6 border-t bg-[#e2e9e6]/25 p-5 dark:bg-white/[.025] lg:border-t-0 lg:border-l sm:p-7">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert
                className="size-5 text-[#b9651b]"
                aria-hidden="true"
              />
              <h2 className="font-semibold">
                {t("relayops:incidentRoom.operationalState")}
              </h2>
            </div>
            <dl className="mt-5 grid gap-4">
              <TimestampFact
                label={t("relayops:incidentRoom.detectedAt")}
                value={incident.detectedAt}
              />
              <TimestampFact
                label={t("relayops:incidentRoom.acknowledgedAt")}
                value={incident.acknowledgedAt}
              />
              <TimestampFact
                label={t("relayops:incidentRoom.mitigatedAt")}
                value={incident.mitigatedAt}
              />
              <TimestampFact
                label={t("relayops:incidentRoom.resolvedAt")}
                value={incident.resolvedAt}
              />
            </dl>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Users
                className="size-5 text-[#245ebe] dark:text-[#8fb6ff]"
                aria-hidden="true"
              />
              <h2 className="font-semibold">
                {t("relayops:incidentRoom.responseTeam")}
              </h2>
            </div>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  {t("relayops:incidentRoom.commander")}
                </dt>
                <dd className="mt-1 font-medium">
                  {commander?.name ?? t("relayops:incidentRoom.unassigned")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t("relayops:incidentRoom.responders")}
                </dt>
                <dd className="mt-1">
                  {responders.length > 0
                    ? responders.map((responder) => responder.name).join(", ")
                    : t("relayops:incidentRoom.none")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t("relayops:incidentRoom.affectedServices")}
                </dt>
                <dd className="mt-1">
                  {affectedServices.length > 0
                    ? affectedServices.map((item) => item.name).join(", ")
                    : t("relayops:incidentRoom.none")}
                </dd>
              </div>
            </dl>
          </div>

          {incident.isDemo ? <DemoChecklist /> : null}

          {incident.resolutionSummary ? (
            <div>
              <h2 className="font-semibold">
                {t("relayops:incidentRoom.resolutionSummary")}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {incident.resolutionSummary}
              </p>
            </div>
          ) : null}
        </aside>
      </div>

      {showCommands ? (
        <IncidentCommandPanel
          workspaceId={workspaceId}
          detail={detail}
          capabilityContext={{
            primaryServiceOwned: ownership.primaryServiceOwned,
          }}
        />
      ) : null}
    </section>
  );
}
