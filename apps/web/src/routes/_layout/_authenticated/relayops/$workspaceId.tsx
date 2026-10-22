import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronsUpDown,
  Columns3,
  ListFilter,
  Menu as MenuIcon,
  Radio,
  Server,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { AccountContext } from "@/components/relayops/account-context";
import { BrandWordmark } from "@/components/relayops/brand";
import { CreateIncidentDialog } from "@/components/relayops/create-incident-dialog";
import { RelayOpsLanguageSwitcher } from "@/components/relayops/language-switcher";
import { LiveIncidentClockRail } from "@/components/relayops/live-incident-clock-rail";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { UsageGuide } from "@/components/relayops/usage-guide";
import { ThemeToggleDropdown } from "@/components/theme-toggle-dropdown";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useActivateRelayOpsWorkspace,
  useRelayOpsOverview,
  useRelayOpsWorkspaceState,
} from "@/hooks/queries/relayops/use-relayops";
import useGetFullWorkspace from "@/hooks/queries/workspace/use-get-full-workspace";
import {
  retryRelayOpsRealtime,
  useRelayOpsRealtimeState,
} from "@/hooks/relayops/realtime-store";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import "@/components/relayops/signal-scene-motion.css";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId",
)({
  component: RelayOpsShell,
});

function RelayOpsShell() {
  const { t } = useTranslation();
  const pathname = useLocation({ select: (location) => location.pathname });
  const reduceMotion = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);
  const routeAnimation = useRef<Animation | null>(null);
  const previousPath = useRef(pathname);
  const navigationInput = useRef<"pointer" | "keyboard">("keyboard");
  const [keyboardNavigation, setKeyboardNavigation] = useState(true);
  const { user } = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => {
    const pointer = () => {
      navigationInput.current = "pointer";
      setKeyboardNavigation(false);
    };
    const keyboard = () => {
      navigationInput.current = "keyboard";
      setKeyboardNavigation(true);
    };
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", keyboard, true);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", keyboard, true);
    };
  }, []);
  useEffect(() => {
    if (previousPath.current === pathname) {
      if (reduceMotion) routeAnimation.current?.cancel();
      return;
    }
    previousPath.current = pathname;
    setNavigationOpen(false);
    const main = mainRef.current;
    if (
      reduceMotion ||
      navigationInput.current === "keyboard" ||
      !main?.animate
    ) {
      routeAnimation.current?.cancel();
      return;
    }
    // Keep Outlet mounted: only the surface moves, without hiding fresh data
    // or throwing away a nested route's form state just to replay an entrance.
    const from =
      routeAnimation.current?.playState === "running"
        ? getComputedStyle(main).transform
        : "translate3d(0, 6px, 0)";
    routeAnimation.current?.cancel();
    routeAnimation.current = main.animate(
      [{ transform: from }, { transform: "translate3d(0, 0, 0)" }],
      { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, [pathname, reduceMotion]);
  useEffect(() => () => routeAnimation.current?.cancel(), []);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 961px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setNavigationOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const { workspaceId } = Route.useParams();
  const workspace = useRelayOpsWorkspaceState(workspaceId);
  const fullWorkspace = useGetFullWorkspace({ workspaceId });
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
      <main className="sbor-auth min-h-screen w-full bg-[#f5f4fb] p-6 dark:bg-[#101124]">
        <RelayOpsSkeleton rows={7} />
      </main>
    );
  }

  if (workspace.error || !workspace.data) {
    return (
      <main className="sbor-auth min-h-screen w-full bg-[#f5f4fb] p-6 dark:bg-[#101124]">
        <RelayOpsErrorState
          error={workspace.error}
          onRetry={() => workspace.refetch()}
        />
      </main>
    );
  }

  if (workspace.data.productMode === "legacy") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f4fb] p-5 text-[#1b1d36] dark:bg-[#101124] dark:text-[#f5f4fb]">
        <PageTitle title={t("relayops:activation.pageTitle")} />
        <section className="w-full max-w-2xl rounded-xl border border-[#1b1d36]/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1a1c35] sm:p-9">
          <span className="grid size-11 place-items-center rounded-lg bg-[#6757ec] text-white">
            <Radio className="size-6" />
          </span>
          <p className="mt-6 font-mono text-[#6757ec] text-xs tracking-[0.18em] dark:text-[#b3a5ff]">
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

  const guest = Boolean(user && "isAnonymous" in user && user.isAnonymous);
  const displayName = guest
    ? t("relayops:brand.guestIdentity")
    : (user?.name ?? t("relayops:account.workspace", { name: "…" }));
  const initials = guest
    ? "ГС"
    : (user?.name ?? "")
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();
  const renderNavigation = (mobile = false) => (
    <nav className="sbor-navigation" aria-label={t("relayops:nav.primary")}>
      {nav.map(({ label, to, icon: Icon }) => {
        const target = to.replace("$workspaceId", workspaceId);
        const active =
          to === "/relayops/$workspaceId"
            ? pathname === target || pathname === `${target}/`
            : pathname.startsWith(target);
        return (
          <Link
            key={to}
            to={to}
            params={{ workspaceId }}
            onClick={() => setNavigationOpen(false)}
            data-guide={
              to.endsWith("/services")
                ? "services"
                : to.endsWith("/board")
                  ? "board"
                  : to.endsWith("/analytics")
                    ? "analytics"
                    : to.endsWith("/incidents")
                      ? "history"
                      : undefined
            }
            activeOptions={{ exact: to === "/relayops/$workspaceId" }}
            className={active ? "is-active" : ""}
          >
            {active ? (
              <motion.span
                className="sbor-nav-indicator"
                aria-hidden="true"
                initial={false}
                layoutId={mobile ? "mobile-navigation" : "desktop-navigation"}
                transition={{
                  duration: reduceMotion || keyboardNavigation ? 0 : 0.2,
                  ease: [0.23, 1, 0.32, 1],
                }}
              />
            ) : null}
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div data-relayops-shell className="sbor-app">
      <PageTitle title={t("relayops:pageTitle")} hideAppName />
      <a href="#relayops-main" className="sbor-skip">
        {t("relayops:skipToContent")}
      </a>
      <aside className="sbor-sidebar">
        <Link
          to="/relayops/$workspaceId"
          params={{ workspaceId }}
          className="sbor-brand-link"
        >
          <BrandWordmark />
        </Link>
        <p className="sbor-sidebar-caption">
          {t("relayops:brand.navigationCaption")}
        </p>
        {renderNavigation()}
        <div className="sbor-sidebar-bottom">
          <div className="sbor-guide">
            <UsageGuide />
          </div>
          <div className="sbor-sidebar-note">
            <span className="signal-dot" />
            {t("relayops:brand.workspaceBoundary")}
          </div>
        </div>
      </aside>
      <div className="sbor-app-column">
        <header className="sbor-topbar">
          <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
            <SheetTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="sbor-mobile-menu"
                  aria-label={t("relayops:nav.primary")}
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetPopup
              side="left"
              className="sbor-mobile-sidebar relay-dialog"
            >
              <SheetTitle className="sr-only">
                {t("relayops:nav.primary")}
              </SheetTitle>
              <BrandWordmark />
              {navigationOpen ? renderNavigation(true) : null}
              <UsageGuide />
            </SheetPopup>
          </Sheet>
          <Link to="/dashboard" className="sbor-workspace-selector">
            <span className="sbor-workspace-icon">
              {(fullWorkspace.data?.name ?? "С").slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{fullWorkspace.data?.name ?? "…"}</strong>
              <small>
                {guest
                  ? t("relayops:brand.demoMode")
                  : t("relayops:brand.workspaceLabel")}
              </small>
            </span>
            <ChevronsUpDown size={14} />
          </Link>
          <div className="sbor-topbar-actions">
            <span
              className="sbor-connection"
              data-state={connection}
              aria-live="polite"
            >
              <span className="signal-dot" />
              {t(`relayops:connection.${connection}`)}
              {reconnectSeconds !== null && connection === "reconnecting"
                ? t("relayops:connection.reconnectIn", {
                    seconds: reconnectSeconds,
                  })
                : null}
            </span>
            {connection === "offline" || connection === "stale" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => retryRelayOpsRealtime(workspaceId)}
              >
                {t("relayops:connection.retry")}
              </Button>
            ) : null}
            <div data-guide="create">
              <CreateIncidentDialog workspaceId={workspaceId} />
            </div>
            <details className="sbor-account-menu">
              <summary aria-label={t("relayops:nav.manage")}>
                <span className="sbor-avatar">{initials}</span>
                <ChevronDown size={13} />
              </summary>
              <div className="sbor-account-popup">
                <strong>{displayName}</strong>
                <div className="sbor-preferences">
                  <ThemeToggleDropdown />
                  <RelayOpsLanguageSwitcher />
                </div>
                <AccountContext workspaceId={workspaceId} />
              </div>
            </details>
          </div>
        </header>
        {overview.data?.activeIncidents.length || overview.error ? (
          <div className="sbor-live-ribbon">
            <LiveIncidentClockRail
              workspaceId={workspaceId}
              incidents={overview.data?.activeIncidents ?? []}
              loading={overview.isLoading}
              error={Boolean(overview.error)}
              onRetry={() => void overview.refetch()}
            />
          </div>
        ) : null}
        <main
          id="relayops-main"
          ref={mainRef}
          tabIndex={-1}
          className="sbor-main"
        >
          <Outlet />
        </main>
        <footer className="sbor-footer">
          {t("relayops:shell.provenance")}
        </footer>
      </div>
    </div>
  );
}
