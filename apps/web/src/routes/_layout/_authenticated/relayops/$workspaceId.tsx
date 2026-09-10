import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  BarChart3,
  Columns3,
  ListFilter,
  Radio,
  Server,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { CreateIncidentDialog } from "@/components/relayops/create-incident-dialog";
import { RelayOpsLanguageSwitcher } from "@/components/relayops/language-switcher";
import { LiveIncidentClockRail } from "@/components/relayops/live-incident-clock-rail";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useActivateRelayOpsWorkspace,
  useRelayOpsOverview,
  useRelayOpsWorkspaceState,
} from "@/hooks/queries/relayops/use-relayops";
import {
  retryRelayOpsRealtime,
  useRelayOpsRealtimeState,
} from "@/hooks/relayops/realtime-store";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import { formatRelayOpsDateTime } from "@/lib/relayops-format";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId",
)({
  component: RelayOpsShell,
});

function RelayOpsShell() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const workspace = useRelayOpsWorkspaceState(workspaceId);
  const overview = useRelayOpsOverview(workspaceId);
  const activate = useActivateRelayOpsWorkspace(workspaceId);
  const connection = useUserWebSocket({ relayOpsWorkspaceId: workspaceId });
  const realtime = useRelayOpsRealtimeState(workspaceId);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!realtime.reconnectAt) return;
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [realtime.reconnectAt]);
  const reconnectSeconds = realtime.reconnectAt
    ? Math.max(0, Math.ceil((realtime.reconnectAt - clock) / 1_000))
    : null;
  const canActivate = useRelayOpsCapability(
    "action.workspace.activate",
    {},
    workspaceId,
  );
  const canOpenOverview = useRelayOpsCapability(
    "route.overview",
    {},
    workspaceId,
  );
  const canOpenWorkbench = useRelayOpsCapability(
    "route.workbench",
    {},
    workspaceId,
  );
  const canOpenServices = useRelayOpsCapability(
    "route.services",
    {},
    workspaceId,
  );
  const canOpenBoard = useRelayOpsCapability("route.board", {}, workspaceId);
  const canOpenAnalytics = useRelayOpsCapability(
    "route.analytics",
    {},
    workspaceId,
  );
  const canOpenLegacy = useRelayOpsCapability("route.legacy", {}, workspaceId);

  if (workspace.isLoading) {
    return (
      <main className="min-h-screen bg-[#f4f6f5] p-6 dark:bg-[#0b1210]">
        <RelayOpsSkeleton rows={7} />
      </main>
    );
  }

  if (workspace.error || !workspace.data) {
    return (
      <main className="min-h-screen bg-[#f4f6f5] p-6 dark:bg-[#0b1210]">
        <RelayOpsErrorState
          error={workspace.error}
          onRetry={() => workspace.refetch()}
        />
      </main>
    );
  }

  if (workspace.data.productMode === "legacy") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f6f5] p-5 text-[#17211f] dark:bg-[#0b1210] dark:text-[#f4f6f5]">
        <PageTitle title={t("relayops:activation.pageTitle")} />
        <section className="w-full max-w-2xl rounded-xl border border-[#17211f]/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#101a18] sm:p-9">
          <span className="grid size-11 place-items-center rounded-lg bg-[#245ebe] text-white">
            <Radio className="size-6" />
          </span>
          <p className="mt-6 font-mono text-[#245ebe] text-xs tracking-[0.18em] dark:text-[#8fb6ff]">
            {t("relayops:activation.eyebrow")}
          </p>
          <h1 className="mt-2 font-semibold text-3xl tracking-tight">
            {t("relayops:activation.title")}
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            {t("relayops:activation.description")}
          </p>
          {(workspace.data.legacyProjectCount > 0 ||
            workspace.data.legacyTaskCount > 0) && (
            <div className="mt-6 rounded-lg border border-[#b9651b]/25 bg-[#b9651b]/8 p-4 text-sm">
              {t("relayops:activation.legacyNotice", {
                projects: workspace.data.legacyProjectCount,
                tasks: workspace.data.legacyTaskCount,
              })}
            </div>
          )}
          {activate.error ? (
            <p className="mt-4 text-destructive text-sm" role="alert">
              {t("relayops:activation.error")}
            </p>
          ) : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => activate.mutate()}
              disabled={
                activate.isPending ||
                canActivate.isCheckingPermissions ||
                !canActivate.allowed
              }
            >
              {activate.isPending
                ? t("relayops:activation.activating")
                : t("relayops:activation.submit")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={
                <Link
                  to="/dashboard/workspace/$workspaceId"
                  params={{ workspaceId }}
                />
              }
            >
              {t("relayops:activation.keepLegacy")}
            </Button>
          </div>
          {!canActivate.isCheckingPermissions && !canActivate.allowed ? (
            <p className="mt-4 text-muted-foreground text-sm">
              {t("relayops:activation.adminRequired")}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  const nav = [
    {
      label: t("relayops:nav.operations"),
      to: "/relayops/$workspaceId" as const,
      icon: Activity,
      allowed: canOpenOverview.allowed,
    },
    {
      label: t("relayops:nav.workbench"),
      to: "/relayops/$workspaceId/incidents" as const,
      icon: ListFilter,
      allowed: canOpenWorkbench.allowed,
    },
    {
      label: t("relayops:nav.services"),
      to: "/relayops/$workspaceId/services" as const,
      icon: Server,
      allowed: canOpenServices.allowed,
    },
    {
      label: t("relayops:nav.board"),
      to: "/relayops/$workspaceId/board" as const,
      icon: Columns3,
      allowed: canOpenBoard.allowed,
    },
    {
      label: t("relayops:nav.insights"),
      to: "/relayops/$workspaceId/analytics" as const,
      icon: BarChart3,
      allowed: canOpenAnalytics.allowed,
    },
    {
      label: t("relayops:nav.manage"),
      to: "/relayops/$workspaceId/legacy" as const,
      icon: Settings2,
      allowed: canOpenLegacy.allowed,
    },
  ].filter((item) => item.allowed);

  return (
    <div
      data-relayops-shell
      className="h-full w-full min-w-0 max-w-full overflow-y-auto bg-[#f4f6f5] text-[#17211f] dark:bg-[#0b1210] dark:text-[#f4f6f5]"
    >
      <PageTitle title={t("relayops:pageTitle")} />
      <a
        href="#relayops-main"
        className="fixed top-2 left-2 z-[100] -translate-y-16 rounded-md bg-[#17211f] px-4 py-2 text-white focus:translate-y-0"
      >
        {t("relayops:skipToContent")}
      </a>
      <header className="sticky top-0 z-40 border-[#17211f]/10 border-b bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#101a18]/95">
        <div className="mx-auto flex min-w-0 max-w-[92rem] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/relayops/$workspaceId"
            params={{ workspaceId }}
            className="flex min-h-11 min-w-0 max-w-full items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245ebe]"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#245ebe] text-white">
              <Radio className="size-5" />
            </span>
            <span>
              <span
                className="block font-semibold text-sm tracking-[0.16em]"
                translate="no"
              >
                RELAYOPS
              </span>
              <span className="block text-muted-foreground text-xs">
                {t("relayops:shell.subtitle")}
              </span>
            </span>
          </Link>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs sm:justify-end">
            <RelayOpsLanguageSwitcher />
            <CreateIncidentDialog workspaceId={workspaceId} />
            <Badge
              variant="outline"
              className="min-h-8 gap-2 bg-white dark:bg-[#101a18]"
              aria-live="polite"
            >
              <span
                className={`size-2 rounded-full ${
                  connection === "connected" ? "bg-emerald-600" : "bg-[#b9651b]"
                }`}
              />
              {t(`relayops:connection.${connection}`)}
              {reconnectSeconds !== null && connection === "reconnecting"
                ? t("relayops:connection.reconnectIn", {
                    seconds: reconnectSeconds,
                  })
                : null}
            </Badge>
            {realtime.lastSyncAt ? (
              <span className="hidden text-muted-foreground md:inline">
                {t("relayops:connection.lastSync", {
                  time: formatRelayOpsDateTime(realtime.lastSyncAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </span>
            ) : null}
            {connection === "offline" || connection === "stale" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => retryRelayOpsRealtime(workspaceId)}
              >
                {t("relayops:connection.retry")}
              </Button>
            ) : null}
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-[92rem] gap-1 overflow-x-auto px-3 pb-2 sm:px-5"
          aria-label={t("relayops:nav.primary")}
        >
          {nav.map(({ label, to, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              params={{ workspaceId }}
              activeOptions={{
                exact: to === "/relayops/$workspaceId",
              }}
              activeProps={{
                className:
                  "bg-[#e2e9e6] text-[#17211f] dark:bg-white/12 dark:text-white",
              }}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-muted-foreground text-sm hover:bg-[#e2e9e6]/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245ebe]"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
          {canOpenLegacy.allowed ? (
            <Link
              to="/relayops/$workspaceId/legacy"
              params={{ workspaceId }}
              className="ml-auto hidden min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-muted-foreground text-xs hover:text-foreground lg:flex"
            >
              <Archive className="size-4" />
              {t("relayops:nav.legacyArchive")}
            </Link>
          ) : null}
        </nav>
      </header>
      <LiveIncidentClockRail
        workspaceId={workspaceId}
        incidents={overview.data?.activeIncidents ?? []}
        loading={overview.isLoading}
        error={Boolean(overview.error)}
        onRetry={() => void overview.refetch()}
      />
      <main
        id="relayops-main"
        tabIndex={-1}
        className="mx-auto min-w-0 max-w-[92rem] px-4 py-6 sm:px-6 sm:py-8"
      >
        <Outlet />
      </main>
      <footer className="mx-auto max-w-[92rem] px-4 py-6 text-muted-foreground text-xs sm:px-6">
        {t("relayops:shell.provenance")}
      </footer>
    </div>
  );
}
