import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReliabilityDashboard } from "@/components/relayops/analytics/reliability-dashboard";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { RelayOpsApiError } from "@/fetchers/relayops";
import { useRelayOpsServices } from "@/hooks/queries/relayops/use-relayops";
import {
  useExportRelayOpsReliabilityAnalytics,
  useRelayOpsReliabilityAnalytics,
} from "@/hooks/queries/relayops/use-relayops-analytics";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import {
  parseReliabilityAnalyticsSearch,
  reliabilityAnalyticsRouteSearch,
} from "@/lib/relayops-analytics-search";
import {
  parseWorkbenchSearch,
  serializeWorkbenchSearch,
} from "@/lib/relayops-workbench-search";

type RouteSearch = Record<string, string | undefined>;

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/analytics",
)({
  validateSearch: (raw): RouteSearch =>
    reliabilityAnalyticsRouteSearch(
      parseReliabilityAnalyticsSearch(raw as Record<string, unknown>),
    ),
  component: ReliabilityAnalyticsRoute,
});

function ReliabilityAnalyticsRoute() {
  const { workspaceId } = Route.useParams();
  const routeSearch = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = parseReliabilityAnalyticsSearch(routeSearch);
  const analytics = useRelayOpsReliabilityAnalytics(workspaceId, search);
  const services = useRelayOpsServices(workspaceId);
  const exportAnalytics = useExportRelayOpsReliabilityAnalytics(
    workspaceId,
    search,
  );
  const routeCapability = useRelayOpsCapability(
    "route.analytics",
    {},
    workspaceId,
  );
  const exportCapability = useRelayOpsCapability(
    "action.analytics.export",
    {},
    workspaceId,
  );
  const serviceCapability = useRelayOpsCapability(
    "route.services",
    {},
    workspaceId,
  );

  const denied =
    (!routeCapability.isCheckingPermissions && !routeCapability.allowed) ||
    (analytics.error instanceof RelayOpsApiError &&
      analytics.error.status === 403);
  if (denied) {
    return (
      <RelayOpsErrorState
        error={new RelayOpsApiError("Forbidden", 403)}
        onRetry={() => undefined}
      />
    );
  }
  if (routeCapability.isCheckingPermissions) {
    return <RelayOpsSkeleton rows={8} />;
  }

  const updateSearch = (next: typeof search) => {
    void navigate({ search: reliabilityAnalyticsRouteSearch(next) });
  };
  const drilldown = (bucket: string) => {
    const workbench = parseWorkbenchSearch({
      from: bucket,
      to: bucket,
      status: search.status,
      severity: search.severity,
      service: search.service,
    });
    const workbenchSearch = Object.fromEntries(
      new URLSearchParams(serializeWorkbenchSearch(workbench)).entries(),
    );
    void navigate({
      to: "/relayops/$workspaceId/incidents",
      params: { workspaceId },
      search: workbenchSearch,
    });
  };
  const download = () => {
    exportAnalytics.mutate(undefined, {
      onSuccess: ({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      },
    });
  };

  return (
    <ReliabilityDashboard
      data={analytics.data}
      loading={analytics.isLoading || services.isLoading}
      error={analytics.error ?? services.error}
      onRetry={() => {
        void analytics.refetch();
        void services.refetch();
      }}
      search={search}
      services={(services.data ?? []).map(({ id, name }) => ({ id, name }))}
      canExport={
        !exportCapability.isCheckingPermissions && exportCapability.allowed
      }
      isExporting={exportAnalytics.isPending}
      onSearchChange={updateSearch}
      onDrilldown={drilldown}
      onExport={download}
      onServiceOpen={
        serviceCapability.allowed
          ? (serviceId) => {
              void navigate({
                to: "/relayops/$workspaceId/services/$serviceId",
                params: { workspaceId, serviceId },
              });
            }
          : undefined
      }
    />
  );
}
