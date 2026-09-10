import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { IncidentDetailPanel } from "@/components/relayops/incident-detail-panel";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { SignalPanel } from "@/components/relayops/signals";
import { Button } from "@/components/ui/button";
import {
  useRelayOpsIncident,
  useRelayOpsServices,
} from "@/hooks/queries/relayops/use-relayops";
import {
  useAttachRelayOpsSignal,
  useCreateRelayOpsDemoSignal,
  useCreateRelayOpsManualSignal,
  useRelayOpsSignals,
} from "@/hooks/queries/relayops/use-relayops-signals";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import { useRelayOpsPresence } from "@/hooks/relayops/use-relayops-presence";
import { formatRelayOpsDateTime } from "@/lib/relayops-format";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/incidents/$incidentId",
)({
  component: IncidentRoom,
});

function IncidentRoom() {
  const { t } = useTranslation();
  const { workspaceId, incidentId } = Route.useParams();
  const detail = useRelayOpsIncident(workspaceId, incidentId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const participants = useRelayOpsPresence(workspaceId, incidentId);
  const signals = useRelayOpsSignals(workspaceId);
  const services = useRelayOpsServices(workspaceId);
  const createManual = useCreateRelayOpsManualSignal(workspaceId);
  const createDemo = useCreateRelayOpsDemoSignal(workspaceId);
  const attachSignal = useAttachRelayOpsSignal(workspaceId, incidentId);
  const createCapability = useRelayOpsCapability(
    "action.signal.create",
    {},
    workspaceId,
  );
  const attachCapability = useRelayOpsCapability(
    "action.signal.attach",
    {},
    workspaceId,
  );

  useEffect(() => {
    if (detail.data) headingRef.current?.focus();
  }, [detail.data]);

  if (detail.isLoading) return <RelayOpsSkeleton rows={7} />;
  if (detail.error || !detail.data) {
    return (
      <RelayOpsErrorState
        error={detail.error}
        onRetry={() => detail.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        render={<Link to="/relayops/$workspaceId" params={{ workspaceId }} />}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("relayops:incidentRoom.back")}
      </Button>
      <IncidentDetailPanel
        workspaceId={workspaceId}
        detail={detail.data}
        headingRef={headingRef}
      />
      <section
        aria-label={t("relayops:presence.title")}
        className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm"
      >
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">{t("relayops:presence.title")}</span>
        {participants.length === 0 ? (
          <span className="text-muted-foreground">
            {t("relayops:presence.onlyYou")}
          </span>
        ) : (
          <ul className="flex flex-wrap gap-1" aria-live="polite">
            {participants.map((participant) => (
              <li
                className="rounded-full bg-muted px-2 py-1 text-xs"
                key={participant.userId}
              >
                {participant.displayName}
              </li>
            ))}
          </ul>
        )}
      </section>
      <SignalPanel
        labels={{
          title: t("relayops:signals.title"),
          description: t("relayops:signals.description"),
          intakeEyebrow: t("relayops:signals.eyebrow"),
          manualHeading: t("relayops:signals.manualHeading"),
          queueHeading: t("relayops:signals.queueHeading"),
          titleField: t("relayops:signals.titleField"),
          summaryField: t("relayops:signals.summaryField"),
          serviceField: t("relayops:signals.serviceField"),
          noService: t("relayops:signals.noService"),
          severityField: t("relayops:signals.severityField"),
          createManual: t("relayops:signals.createManual"),
          createDemo: t("relayops:signals.createDemo"),
          attach: t("relayops:signals.attach"),
          attached: t("relayops:signals.attached"),
          empty: t("relayops:signals.empty"),
          pending: t("relayops:signals.pending"),
          error: t("relayops:signals.error"),
          source: t("relayops:signals.source"),
          observedAt: t("relayops:signals.observedAt"),
          severity: {
            unknown: t("relayops:severity.unknown"),
            sev1: t("relayops:severity.sev1"),
            sev2: t("relayops:severity.sev2"),
            sev3: t("relayops:severity.sev3"),
            sev4: t("relayops:severity.sev4"),
          },
        }}
        signals={signals.data ?? []}
        services={(services.data ?? []).map((service) => ({
          id: service.id,
          name: service.name,
        }))}
        incidentVersion={detail.data.incident.version}
        canCreate={createCapability.allowed}
        canAttach={attachCapability.allowed}
        pending={
          createManual.isPending ||
          createDemo.isPending ||
          attachSignal.isPending
        }
        error={
          createManual.error ||
          createDemo.error ||
          attachSignal.error ||
          signals.error
        }
        formatObservedAt={(value) => formatRelayOpsDateTime(value)}
        onCreateManual={async (input) => {
          await createManual.mutateAsync(input);
        }}
        onCreateDemo={async () => {
          await createDemo.mutateAsync(detail.data.incident.serviceId);
        }}
        onAttach={async (input) => {
          await attachSignal.mutateAsync(input);
        }}
      />
    </div>
  );
}
