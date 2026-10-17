import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MessageSquare,
  Server,
  ShieldAlert,
  UserRound,
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
  "incident.signal_attached": "relayops:signals.attached",
} as const;

function TimelineSummary({ payload }: { payload: Record<string, unknown> }) {
  const { t } = useTranslation();
  const message = typeof payload.message === "string" ? payload.message : null;
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  const resolution =
    typeof payload.resolutionSummary === "string"
      ? payload.resolutionSummary
      : null;
  const from = typeof payload.from === "string" ? payload.from : null;
  const to = typeof payload.to === "string" ? payload.to : null;

  return (
    <>
      {from && to && from in statusKeys && to in statusKeys ? (
        <div className="sbor-timeline-transition">
          <span>{t(statusKeys[from as keyof typeof statusKeys])}</span>
          <ArrowRight aria-hidden="true" />
          <span>{t(statusKeys[to as keyof typeof statusKeys])}</span>
        </div>
      ) : null}
      {message || reason || resolution ? (
        <p className="sbor-timeline-message">
          {message ?? reason ?? resolution}
        </p>
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
    <div className="sbor-response-time" data-recorded={Boolean(value)}>
      <dt>
        <span aria-hidden="true">{value ? <Check /> : <span />}</span>
        {label}
      </dt>
      <dd>
        {value
          ? formatRelayOpsDateTime(value)
          : t("relayops:incidentRoom.notRecorded")}
      </dd>
    </div>
  );
}

function PersonAvatar({ name }: { name?: string }) {
  const initials = name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <span className="sbor-person-avatar" aria-hidden="true">
      {initials || <UserRound />}
    </span>
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
    <section
      className="sbor-demo-checklist"
      aria-labelledby="demo-checklist-heading"
    >
      <div className="sbor-room-section-title">
        <CheckCircle2 aria-hidden="true" />
        <h2 id="demo-checklist-heading">
          {t("relayops:incidentRoom.checklistTitle")}
        </h2>
        <Badge variant="outline">{t("relayops:incidentRoom.demoBadge")}</Badge>
      </div>
      <p className="sbor-room-caption">
        {t("relayops:incidentRoom.demoChecklistDescription")}
      </p>
      <div className="sbor-checklist-items">
        {labels.map((label, index) => (
          <label key={label} data-checked={checked[index]}>
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
            />
            <span>{label}</span>
          </label>
        ))}
        {checked.every(Boolean) ? (
          <p role="status" className="sbor-checklist-success">
            <CheckCircle2 aria-hidden="true" />
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
  const reduceMotion = useReducedMotion();
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
  const participants = new Map(
    [...(commander ? [commander] : []), ...responders].map((participant) => [
      participant.id,
      participant.name,
    ]),
  );

  return (
    <section
      className="relay-incident-room sbor-incident-room"
      data-status={incident.status}
    >
      <header className="sbor-room-header">
        <div className="sbor-room-heading">
          <div className="sbor-room-identifiers">
            <span className="sbor-room-key">{incident.key}</span>
            <span
              className="sbor-room-severity"
              data-severity={incident.severity}
            >
              <ShieldAlert aria-hidden="true" />
              {incident.severity.toUpperCase()}
            </span>
            {incident.isDemo ? (
              <Badge className="sbor-demo-badge">
                {t("relayops:incidentRoom.demoBadge")}
              </Badge>
            ) : null}
            <Badge variant="outline" className="sbor-impact-badge">
              {t(impactKeys[incident.impact as keyof typeof impactKeys])}
            </Badge>
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="sbor-room-title">
            {incident.title}
          </h1>
          {incident.summary ? (
            <p className="sbor-room-summary">{incident.summary}</p>
          ) : null}
          <div className="sbor-room-meta">
            <Link
              to="/relayops/$workspaceId/services/$serviceId"
              params={{ workspaceId, serviceId: service.id }}
              className="sbor-room-service"
            >
              <Server aria-hidden="true" />
              {service.name}
              <ArrowRight aria-hidden="true" />
            </Link>
            <span>
              <Clock3 aria-hidden="true" />
              {t("relayops:incidentRoom.freshness", {
                time: formatRelayOpsDateTime(incident.lastUpdateAt),
              })}
            </span>
          </div>
        </div>
        <div className="sbor-room-owner">
          <PersonAvatar name={commander?.name} />
          <div>
            <span>{t("relayops:incidentRoom.commander")}</span>
            <strong>
              {commander?.name ?? t("relayops:incidentRoom.unassigned")}
            </strong>
          </div>
        </div>
      </header>

      <ol
        className="sbor-room-lifecycle"
        aria-label={t("relayops:commands.transition")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The overflowing lifecycle needs native keyboard scrolling.
        tabIndex={0}
      >
        {(
          [
            "detected",
            "triaging",
            "mitigating",
            "monitoring",
            "resolved",
          ] as const
        ).map((status, index) => (
          <li
            key={status}
            aria-current={incident.status === status ? "step" : undefined}
          >
            <span className="sbor-lifecycle-node" aria-hidden="true">
              {incident.status === status ? (
                <Activity />
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            <span>{t(statusKeys[status])}</span>
          </li>
        ))}
        {incident.status === "dismissed" ? (
          <li aria-current="step">
            <span className="sbor-lifecycle-node" aria-hidden="true">
              <Check />
            </span>
            <span>{t(statusKeys.dismissed)}</span>
          </li>
        ) : null}
      </ol>

      <div className="sbor-room-body">
        <div className="sbor-room-main">
          {incident.resolutionSummary ? (
            <section className="sbor-resolution-summary">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <h2>{t("relayops:incidentRoom.resolutionSummary")}</h2>
                <p>{incident.resolutionSummary}</p>
              </div>
            </section>
          ) : null}

          <section
            className="sbor-room-history"
            aria-labelledby="timeline-heading"
          >
            <div className="sbor-room-section-title">
              <Activity aria-hidden="true" />
              <h2 id="timeline-heading">{t("relayops:timeline.title")}</h2>
              <span className="sbor-section-count">{timeline.length}</span>
            </div>
            {timeline.length === 0 ? (
              <p className="sbor-timeline-empty">
                {t("relayops:incidentRoom.noTimeline")}
              </p>
            ) : null}
            <ol className="sbor-timeline">
              <AnimatePresence initial={false}>
                {timeline.map((event) => (
                  <motion.li
                    key={event.id}
                    initial={{
                      opacity: 0,
                      transform: reduceMotion ? "none" : "translateY(10px)",
                    }}
                    animate={{
                      opacity: 1,
                      transform: reduceMotion ? "none" : "translateY(0px)",
                    }}
                    transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                    className="sbor-timeline-event"
                    data-event={event.type}
                  >
                    <span className="sbor-timeline-icon" aria-hidden="true">
                      {event.type === "incident.update_published" ? (
                        <MessageSquare />
                      ) : event.type === "incident.resolved" ? (
                        <CheckCircle2 />
                      ) : event.type === "incident.assignment_changed" ? (
                        <Users />
                      ) : (
                        <Activity />
                      )}
                    </span>
                    <article>
                      <div className="sbor-timeline-heading">
                        <h3>
                          {t(
                            eventKeys[event.type as keyof typeof eventKeys] ??
                              "relayops:timeline.fallback",
                          )}
                        </h3>
                        <div className="sbor-timeline-attribution">
                          {event.actorUserId &&
                          participants.has(event.actorUserId) ? (
                            <span>
                              <PersonAvatar
                                name={participants.get(event.actorUserId)}
                              />
                              {participants.get(event.actorUserId)}
                            </span>
                          ) : null}
                          <time
                            dateTime={new Date(event.occurredAt).toISOString()}
                          >
                            {formatRelayOpsDateTime(event.occurredAt)}
                          </time>
                          <details className="sbor-event-details">
                            <summary
                              aria-label={t(
                                "relayops:incidentRoom.technicalDetails",
                              )}
                              title={t(
                                "relayops:incidentRoom.technicalDetails",
                              )}
                            >
                              <ChevronDown aria-hidden="true" />
                            </summary>
                            <p>
                              {t("relayops:incidentRoom.version", {
                                version: event.incidentVersion,
                              })}
                            </p>
                          </details>
                        </div>
                      </div>
                      <TimelineSummary payload={event.payload} />
                    </article>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </section>
        </div>

        {showCommands ? (
          <div className="sbor-room-command-area">
            <IncidentCommandPanel
              workspaceId={workspaceId}
              detail={detail}
              capabilityContext={{
                primaryServiceOwned: ownership.primaryServiceOwned,
              }}
            />
          </div>
        ) : null}

        <aside className="sbor-room-sidebar">
          <section>
            <div className="sbor-room-section-title">
              <Users aria-hidden="true" />
              <h2>{t("relayops:incidentRoom.responseTeam")}</h2>
            </div>
            <dl className="sbor-team-facts">
              <div>
                <dt>{t("relayops:incidentRoom.responders")}</dt>
                <dd>
                  {responders.length > 0 ? (
                    <ul className="sbor-responder-list">
                      {responders.map((responder) => (
                        <li key={responder.id}>
                          <PersonAvatar name={responder.name} />
                          <span>{responder.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    t("relayops:incidentRoom.none")
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("relayops:incidentRoom.affectedServices")}</dt>
                <dd className="sbor-affected-services">
                  {affectedServices.length > 0
                    ? affectedServices.map((item) => (
                        <span key={item.id}>
                          <Server aria-hidden="true" />
                          {item.name}
                        </span>
                      ))
                    : t("relayops:incidentRoom.none")}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <div className="sbor-room-section-title">
              <Clock3 aria-hidden="true" />
              <h2>{t("relayops:incidentRoom.operationalState")}</h2>
            </div>
            <dl className="sbor-response-times">
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
          </section>
          {incident.isDemo ? <DemoChecklist /> : null}
          <details className="sbor-room-technical">
            <summary>
              <ChevronDown aria-hidden="true" />
              {t("relayops:incidentRoom.technicalDetails")}
            </summary>
            <p>{t("relayops:incidentRoom.authoritative")}</p>
            <p>
              {t("relayops:incidentRoom.version", {
                version: incident.version,
              })}
            </p>
          </details>
        </aside>
      </div>
    </section>
  );
}
