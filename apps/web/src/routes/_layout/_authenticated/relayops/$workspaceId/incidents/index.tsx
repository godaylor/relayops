import {
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { IncidentWorkbench } from "@/components/relayops/workbench/incident-workbench";
import type {
  SavedViewConflict,
  WorkbenchPage,
} from "@/components/relayops/workbench/types";
import { getWorkbenchLabels } from "@/components/relayops/workbench/workbench-labels";
import {
  isRelayOpsSavedViewConflict,
  RelayOpsApiError,
} from "@/fetchers/relayops";
import {
  useCreateRelayOpsSavedView,
  useRelayOpsIncident,
  useRelayOpsSavedViews,
  useRelayOpsWorkbench,
  useUpdateRelayOpsSavedView,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import {
  mergeSavedWorkbenchSearch,
  parseWorkbenchSearch,
  serializeWorkbenchSearch,
  toSavedWorkbenchDefinition,
  type WorkbenchSearch,
} from "@/lib/relayops-workbench-search";

type RouteSearch = Record<string, string | undefined>;

function toRouteSearch(search: WorkbenchSearch): RouteSearch {
  return Object.fromEntries(
    new URLSearchParams(serializeWorkbenchSearch(search)).entries(),
  );
}

function rawSearchFromString(searchString: string) {
  const raw: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(searchString)) {
    const previous = raw[key];
    raw[key] = previous
      ? Array.isArray(previous)
        ? [...previous, value]
        : [previous, value]
      : value;
  }
  return raw;
}

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/incidents/",
)({
  validateSearch: (raw): RouteSearch =>
    toRouteSearch(parseWorkbenchSearch(raw as Record<string, unknown>)),
  component: IncidentWorkbenchRoute,
});

function IncidentWorkbenchRoute() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { workspaceId } = Route.useParams();
  const routeSearch = Route.useSearch();
  const location = useLocation();
  const navigate = useNavigate({ from: Route.fullPath });
  const labels = useMemo(() => getWorkbenchLabels(t), [t]);
  const savedViews = useRelayOpsSavedViews(workspaceId);
  const rawSearch = useMemo(
    () => rawSearchFromString(location.searchStr),
    [location.searchStr],
  );
  const parsedSearch = useMemo(
    () => parseWorkbenchSearch(routeSearch),
    [routeSearch],
  );
  const selectedView = savedViews.data?.find(
    (view) => view.id === parsedSearch.view,
  );
  const search = useMemo(
    () => mergeSavedWorkbenchSearch(selectedView?.definition, rawSearch),
    [rawSearch, selectedView?.definition],
  );
  const workbench = useRelayOpsWorkbench(workspaceId, search);
  const incident = useRelayOpsIncident(workspaceId, search.incidentId);
  const createSavedView = useCreateRelayOpsSavedView(workspaceId);
  const updateSavedView = useUpdateRelayOpsSavedView(workspaceId);
  const [savedViewConflict, setSavedViewConflict] =
    useState<SavedViewConflict>();

  const routeCapability = useRelayOpsCapability(
    "route.workbench",
    {},
    workspaceId,
  );
  const createCapability = useRelayOpsCapability(
    "action.savedView.create",
    {},
    workspaceId,
  );
  const updateCapability = useRelayOpsCapability(
    "action.savedView.update",
    {
      savedViewOwnerOrShare:
        Boolean(selectedView) && selectedView?.ownerUserId === user?.id,
    },
    workspaceId,
  );

  const navigateToSearch = (next: WorkbenchSearch, replace = false) => {
    let target = next;
    if (next.view !== search.view) {
      const nextView = savedViews.data?.find((view) => view.id === next.view);
      target = nextView
        ? mergeSavedWorkbenchSearch(nextView.definition, {
            view: nextView.id,
            ...(search.incidentId ? { incidentId: search.incidentId } : {}),
            tab: search.tab,
          })
        : { ...next, view: undefined };
    }
    void navigate({ search: toRouteSearch(target), replace });
  };

  useEffect(() => {
    if (!selectedView) return;
    if (
      serializeWorkbenchSearch(parsedSearch) ===
      serializeWorkbenchSearch(search)
    ) {
      return;
    }
    void navigate({ search: toRouteSearch(search), replace: true });
  }, [navigate, parsedSearch, search, selectedView]);

  const page = useMemo<WorkbenchPage | undefined>(() => {
    const data = workbench.data;
    const first = data?.pages[0];
    if (!data || !first) return undefined;
    const last = data.pages.at(-1) ?? first;
    return {
      items: data.pages.flatMap((entry) => entry.items),
      nextCursor: last.nextCursor,
      facets: first.facets,
      groups: first.groups,
    };
  }, [workbench.data]);

  const denied =
    (!routeCapability.isCheckingPermissions && !routeCapability.allowed) ||
    (workbench.error instanceof RelayOpsApiError &&
      workbench.error.status === 403) ||
    (savedViews.error instanceof RelayOpsApiError &&
      savedViews.error.status === 403);
  const state = denied
    ? "denied"
    : routeCapability.isCheckingPermissions ||
        workbench.isLoading ||
        savedViews.isLoading
      ? "loading"
      : workbench.error || savedViews.error
        ? "error"
        : "ready";

  const applyCurrentSavedView = (view: NonNullable<typeof selectedView>) => {
    setSavedViewConflict(undefined);
    navigateToSearch(
      mergeSavedWorkbenchSearch(view.definition, {
        view: view.id,
        ...(search.incidentId ? { incidentId: search.incidentId } : {}),
        tab: search.tab,
      }),
    );
  };

  return (
    <IncidentWorkbench
      workspaceId={workspaceId}
      search={search}
      labels={labels}
      state={state}
      page={page}
      error={(workbench.error || savedViews.error) as Error | null}
      isFetching={workbench.isFetching && !workbench.isLoading}
      isLoadingMore={workbench.isFetchingNextPage}
      selectedDetail={incident.data}
      selectedDetailLoading={incident.isLoading}
      savedViews={savedViews.data}
      savedViewConflict={savedViewConflict}
      onSearchChange={navigateToSearch}
      onSelectIncident={(incidentId) =>
        navigateToSearch({ ...search, incidentId })
      }
      onLoadMore={() => {
        if (workbench.hasNextPage && !workbench.isFetchingNextPage) {
          void workbench.fetchNextPage();
        }
      }}
      onRetry={() => {
        void workbench.refetch();
        void savedViews.refetch();
      }}
      onCreateSavedView={
        createCapability.allowed
          ? async (name, visibility) => {
              const created = await createSavedView.mutateAsync({
                name,
                visibility,
                definition: toSavedWorkbenchDefinition(search),
              });
              await navigate({
                search: toRouteSearch({ ...search, view: created.id }),
              });
            }
          : undefined
      }
      onUpdateSavedView={
        updateCapability.allowed
          ? async (view) => {
              try {
                await updateSavedView.mutateAsync({
                  id: view.id,
                  input: {
                    expectedVersion: view.version,
                    definition: toSavedWorkbenchDefinition(search),
                  },
                });
                setSavedViewConflict(undefined);
              } catch (error) {
                if (isRelayOpsSavedViewConflict(error)) {
                  setSavedViewConflict({
                    draftName: view.name,
                    expectedVersion: view.version,
                    current: error.body.current,
                  });
                  return;
                }
                throw error;
              }
            }
          : undefined
      }
      onUseCurrentSavedView={(view) => applyCurrentSavedView(view)}
      onRetrySavedViewDraft={async (conflict) => {
        try {
          await updateSavedView.mutateAsync({
            id: conflict.current.id,
            input: {
              expectedVersion: conflict.current.version,
              name: conflict.draftName,
              definition: toSavedWorkbenchDefinition(search),
            },
          });
          setSavedViewConflict(undefined);
        } catch (error) {
          if (isRelayOpsSavedViewConflict(error)) {
            setSavedViewConflict({
              ...conflict,
              expectedVersion: error.body.current.version,
              current: error.body.current,
            });
            return;
          }
          throw error;
        }
      }}
    />
  );
}
