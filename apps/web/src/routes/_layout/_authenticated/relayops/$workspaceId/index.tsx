import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  type Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Radio,
  Server,
  ShieldAlert,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatedMetric } from "@/components/relayops/animated-metric";
import { CreateIncidentDialog } from "@/components/relayops/create-incident-dialog";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { ServiceForm } from "@/components/relayops/service-form";
import { SignalScene } from "@/components/relayops/signal-scene";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RelayOpsService } from "@/fetchers/relayops";
import {
  useCreateRelayOpsDemoIncident,
  useCreateRelayOpsService,
  useRelayOpsOverview,
  useRelayOpsServices,
  useRelayOpsTeams,
  useRemoveRelayOpsDemoData,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import { formatRelayOpsDateTime } from "@/lib/relayops-format";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/",
)({
  component: OperationsOverview,
});

function Metric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone?: "default" | "warning" | "danger";
}) {
  const colors = {
    default: "text-[#6757ec] bg-[#6757ec]/8 dark:text-[#b3a5ff]",
    warning: "text-[#b9651b] bg-[#b9651b]/8",
    danger: "text-[#b73a34] bg-[#b73a34]/8",
  };
  return (
    <article
      data-sbor-metric
      className="rounded-lg border border-[#1b1d36]/10 bg-white p-4 dark:border-white/10 dark:bg-[#1a1c35]"
    >
      <div
        className={`grid size-9 place-items-center rounded-md ${colors[tone]}`}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-5 font-semibold text-3xl tabular-nums">
        <AnimatedMetric value={value} />
      </p>
      <p className="mt-1 text-muted-foreground text-sm">{label}</p>
    </article>
  );
}

function OperationsOverview() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const overview = useRelayOpsOverview(workspaceId);
  const services = useRelayOpsServices(workspaceId);
  const teams = useRelayOpsTeams(workspaceId);
  const createService = useCreateRelayOpsService(workspaceId);
  const createDemo = useCreateRelayOpsDemoIncident(workspaceId);
  const removeDemo = useRemoveRelayOpsDemoData(workspaceId);
  const [createdService, setCreatedService] = useState<RelayOpsService>();
  const canCreateService = useRelayOpsCapability(
    "action.service.create",
    {},
    workspaceId,
  );
  const canCreateIncident = useRelayOpsCapability(
    "action.incident.create",
    {},
    workspaceId,
  );
  const canCleanupDemo = useRelayOpsCapability(
    "action.demo.cleanup",
    {},
    workspaceId,
  );

  if (overview.isLoading || services.isLoading || teams.isLoading) {
    return <RelayOpsSkeleton rows={7} />;
  }
  const error = overview.error || services.error || teams.error;
  if (error || !overview.data || !services.data || !teams.data) {
    return (
      <RelayOpsErrorState
        error={error}
        onRetry={() => {
          void overview.refetch();
          void services.refetch();
          void teams.refetch();
        }}
      />
    );
  }

  const isFirstService = services.data.length === 0;
  if (isFirstService || createdService) {
    return (
      <section className="sbor-onboarding mx-auto max-w-4xl">
        <img
          className="sbor-response-art"
          src="/brand/response-network-640.webp"
          srcSet="/brand/response-network-320.webp 320w, /brand/response-network-640.webp 640w"
          sizes="(max-width: 700px) 160px, 240px"
          width={640}
          height={400}
          alt=""
          aria-hidden="true"
          decoding="async"
        />
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-[#6757ec] text-white">
            <Radio className="size-5" />
          </span>
          <div>
            <p className="font-mono text-[#6757ec] text-xs tracking-[0.16em] dark:text-[#b3a5ff]">
              {t("relayops:onboarding.eyebrow")}
            </p>
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
              {t("relayops:onboarding.title")}
            </h1>
          </div>
        </div>
        <ol className="mb-6 grid grid-cols-3 gap-2 text-xs sm:text-sm">
          {[
            t("relayops:onboarding.stepWorkspace"),
            t("relayops:onboarding.stepService"),
            t("relayops:onboarding.stepIncident"),
          ].map((step, index) => (
            <li
              key={step}
              className={`rounded-md border p-3 ${
                index === 0 || (index === 1 && !createdService)
                  ? "border-[#6757ec]/30 bg-[#6757ec]/5"
                  : "border-[#1b1d36]/10 bg-white dark:border-white/10 dark:bg-[#1a1c35]"
              }`}
            >
              <span className="mr-2 font-mono text-muted-foreground">
                0{index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <div className="rounded-xl border border-[#1b1d36]/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1a1c35] sm:p-7">
          {!createdService ? (
            <>
              <h2 className="font-semibold text-xl">
                {t("relayops:onboarding.serviceTitle")}
              </h2>
              <p className="mt-2 mb-6 text-muted-foreground text-sm">
                {t("relayops:onboarding.serviceDescription")}
              </p>
              {!canCreateService.isCheckingPermissions &&
              !canCreateService.allowed ? (
                <div className="rounded-md border border-[#b9651b]/30 bg-[#b9651b]/8 p-4 text-sm">
                  {t("relayops:onboarding.serviceDenied")}
                </div>
              ) : (
                <ServiceForm
                  teams={teams.data}
                  pending={createService.isPending}
                  error={createService.error}
                  submitLabel={t("relayops:onboarding.createService")}
                  onSubmit={async (input) => {
                    const created = await createService.mutateAsync(input);
                    setCreatedService(created);
                  }}
                />
              )}
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-6 text-emerald-700" />
                <div>
                  <h2 className="font-semibold text-xl">
                    {t("relayops:onboarding.serviceReady", {
                      name: createdService.name,
                    })}
                  </h2>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {t("relayops:onboarding.demoDescription")}
                  </p>
                </div>
              </div>
              {createDemo.error ? (
                <p role="alert" className="mt-5 text-destructive text-sm">
                  {t("relayops:onboarding.demoError")}
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <CreateIncidentDialog
                  workspaceId={workspaceId}
                  serviceId={createdService.id}
                />
                <Button
                  variant="outline"
                  size="lg"
                  disabled={
                    createDemo.isPending ||
                    canCreateIncident.isCheckingPermissions ||
                    !canCreateIncident.allowed
                  }
                  onClick={async () => {
                    const detail = await createDemo.mutateAsync(
                      createdService.id,
                    );
                    await navigate({
                      to: "/relayops/$workspaceId/incidents/$incidentId",
                      params: {
                        workspaceId,
                        incidentId: detail.incident.id,
                      },
                    });
                  }}
                >
                  <ShieldAlert className="size-4" />
                  {createDemo.isPending
                    ? t("relayops:onboarding.creatingDemo")
                    : t("relayops:onboarding.createDemo")}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setCreatedService(undefined)}
                >
                  {t("relayops:onboarding.skipDemo")}
                </Button>
              </div>
              <p className="mt-4 text-muted-foreground text-xs">
                {t("relayops:onboarding.demoSafety")}
              </p>
            </>
          )}
        </div>
      </section>
    );
  }

  const priorityIncident =
    overview.data.activeIncidents.find((incident) => !incident.commanderId) ??
    overview.data.activeIncidents[0];
  const serviceById = new Map(
    services.data.map((service) => [service.id, service]),
  );
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

  return (
    <div className="sbor-overview space-y-7">
      <div className="sbor-overview-hero">
        <div>
          <p className="font-mono text-[#6757ec] text-xs tracking-[0.16em] dark:text-[#b3a5ff]">
            {t("relayops:brand.overviewEyebrow")}
          </p>
          <h1 className="mt-1 font-semibold text-3xl tracking-tight">
            {t("relayops:brand.overviewTitle")}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {t("relayops:brand.overviewDescription")}
          </p>
        </div>
        <SignalScene compact />
      </div>

      <section
        className="sbor-focus-strip"
        data-attention={Boolean(priorityIncident)}
      >
        <span className="sbor-focus-icon" aria-hidden="true">
          {priorityIncident ? <ShieldAlert /> : <CheckCircle2 />}
        </span>
        <div>
          <h2>{t("relayops:overview.focusTitle")}</h2>
          <p>
            {overview.data.commanderlessCount > 0
              ? t("relayops:overview.focusUnassigned", {
                  count: overview.data.commanderlessCount,
                })
              : priorityIncident
                ? t("relayops:overview.focusActive", {
                    count: overview.data.activeIncidents.length,
                  })
                : t("relayops:overview.noActiveDescription")}
          </p>
        </div>
        <Link
          className="sbor-focus-action"
          to={
            priorityIncident
              ? "/relayops/$workspaceId/incidents/$incidentId"
              : "/relayops/$workspaceId/services"
          }
          params={{ workspaceId, incidentId: priorityIncident?.id ?? "" }}
        >
          {priorityIncident
            ? t("relayops:overview.reviewIncident")
            : t("relayops:overview.openCatalog")}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section
        className="sbor-metrics"
        aria-label={t("relayops:overview.metrics")}
      >
        <Metric
          label={t("relayops:overview.activeIncidents")}
          value={overview.data.activeIncidents.length}
          icon={ShieldAlert}
          tone="danger"
        />
        <Metric
          label={t("relayops:overview.degradedServices")}
          value={overview.data.degradedServices.length}
          icon={AlertTriangle}
          tone="warning"
        />
        <Metric
          label={t("relayops:overview.commanderless")}
          value={overview.data.commanderlessCount}
          icon={UserRoundX}
          tone="warning"
        />
        <Metric
          label={t("relayops:overview.services")}
          value={overview.data.serviceCount}
          icon={Server}
        />
      </section>

      <div
        id="operational-insights"
        className="grid scroll-mt-36 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]"
      >
        <section className="sbor-overview-panel">
          <div className="border-b px-5 py-4">
            <div className="sbor-panel-heading">
              <h2 className="font-semibold">
                {t("relayops:overview.activeTitle")}
              </h2>
              <Link
                to="/relayops/$workspaceId/incidents"
                params={{ workspaceId }}
              >
                {t("relayops:overview.openAll")}{" "}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("relayops:overview.activeDescription")}
            </p>
          </div>
          {overview.data.activeIncidents.length === 0 ? (
            <div className="grid min-h-56 place-items-center p-8 text-center">
              <div>
                <CheckCircle2 className="mx-auto size-8 text-emerald-700" />
                <p className="mt-3 font-medium">
                  {t("relayops:overview.noActiveTitle")}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t("relayops:overview.noActiveDescription")}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {overview.data.activeIncidents.map((incident) => (
                <Link
                  key={incident.id}
                  to="/relayops/$workspaceId/incidents/$incidentId"
                  params={{ workspaceId, incidentId: incident.id }}
                  data-severity={incident.severity}
                  data-status={incident.status}
                  className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-[#eeedf8]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6757ec]"
                >
                  <span>
                    <span className="font-mono text-[#6757ec] text-xs dark:text-[#b3a5ff]">
                      {incident.key}
                    </span>
                    <span className="mt-1 block font-medium">
                      {incident.title}
                    </span>
                    <span className="sbor-overview-incident-meta">
                      <span>{serviceById.get(incident.serviceId)?.name}</span>
                      <span>{t(`relayops:status.${incident.status}`)}</span>
                      {!incident.commanderId ? (
                        <span>{t("relayops:assignment.clear")}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge className="bg-[#b73a34] text-white">
                      {incident.severity.toUpperCase()}
                    </Badge>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="sbor-overview-panel">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">
              {t("relayops:overview.latestTitle")}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("relayops:overview.latestDescription")}
            </p>
          </div>
          {overview.data.latestUpdates.length === 0 ? (
            <p className="p-5 text-muted-foreground text-sm">
              {t("relayops:overview.noUpdates")}
            </p>
          ) : (
            <div className="sbor-overview-updates relative p-5 pl-8">
              <span className="absolute top-5 bottom-5 left-[1.05rem] w-px bg-[#6757ec]/25" />
              {overview.data.latestUpdates.map((update) => (
                <article
                  key={update.id}
                  className="sbor-update-entry relative mb-5 last:mb-0"
                >
                  <span className="absolute top-1.5 -left-[1.18rem] size-2.5 rounded-full bg-[#6757ec]" />
                  <span className="sbor-update-type">
                    {t(eventKeys[update.type])}
                  </span>
                  <Link
                    to="/relayops/$workspaceId/incidents/$incidentId"
                    params={{ workspaceId, incidentId: update.incidentId }}
                  >
                    <p className="font-medium text-sm">
                      {update.incidentTitle}
                    </p>
                  </Link>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {update.serviceName} ·{" "}
                    <time dateTime={update.occurredAt}>
                      {formatRelayOpsDateTime(update.occurredAt)}
                    </time>
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {overview.data.demoDataCount > 0 ? (
        <details className="sbor-demo-note">
          <summary>
            <span className="sbor-demo-tag">DEMO</span>
            <span>{t("relayops:demo.title")}</span>
          </summary>
          <div className="sbor-demo-options">
            <p>
              {t("relayops:demo.description", {
                count: overview.data.demoDataCount,
              })}
            </p>
            {canCleanupDemo.allowed ? (
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button variant="destructive-outline" />}
                >
                  <Trash2 className="size-4" />
                  {t("relayops:demo.remove")}
                </AlertDialogTrigger>
                <AlertDialogPopup>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("relayops:demo.confirmTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("relayops:demo.confirmDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogClose render={<Button variant="outline" />}>
                      {t("relayops:demo.cancel")}
                    </AlertDialogClose>
                    <Button
                      variant="destructive"
                      loading={removeDemo.isPending}
                      onClick={() => removeDemo.mutate()}
                    >
                      {t("relayops:demo.confirm")}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogPopup>
              </AlertDialog>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
