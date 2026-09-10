import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  activateRelayOpsWorkspace,
  assignRelayOpsIncidentParticipants,
  changeRelayOpsIncidentSeverity,
  correctRelayOpsIncidentTimestamps,
  createRelayOpsDemoIncident,
  createRelayOpsIncident,
  createRelayOpsSavedView,
  createRelayOpsService,
  deleteRelayOpsSavedView,
  exportRelayOpsLegacyData,
  getRelayOpsIncident,
  getRelayOpsLegacyArchive,
  getRelayOpsOverview,
  getRelayOpsService,
  getRelayOpsWorkspaceState,
  listRelayOpsSavedViews,
  listRelayOpsServices,
  listRelayOpsTeams,
  listRelayOpsWorkbench,
  publishRelayOpsIncidentUpdate,
  type RelayOpsIncidentDetail,
  type RelayOpsParticipantsInput,
  type RelayOpsSavedViewCreateInput,
  type RelayOpsSavedViewUpdateInput,
  type RelayOpsServiceInput,
  type RelayOpsServiceUpdate,
  type RelayOpsSeverityInput,
  type RelayOpsTimestampCorrectionInput,
  type RelayOpsTransitionInput,
  type RelayOpsUpdateInput,
  removeRelayOpsDemoData,
  setRelayOpsServiceArchived,
  transitionRelayOpsIncident,
  updateRelayOpsSavedView,
  updateRelayOpsService,
} from "@/fetchers/relayops";
import {
  type WorkbenchSearch,
  workbenchQueryIdentity,
} from "@/lib/relayops-workbench-search";

export const relayOpsKeys = {
  workspace: (workspaceId: string) => ["relayops", workspaceId] as const,
  workspaceState: (workspaceId: string) =>
    ["relayops", workspaceId, "state"] as const,
  overview: (workspaceId: string) =>
    ["relayops", workspaceId, "overview"] as const,
  services: (
    workspaceId: string,
    query: { q?: string; status?: "active" | "archived" | "all" },
  ) => ["relayops", workspaceId, "services", query] as const,
  service: (workspaceId: string, serviceId: string) =>
    ["relayops", workspaceId, "service", serviceId] as const,
  teams: (workspaceId: string) => ["relayops", workspaceId, "teams"] as const,
  incident: (workspaceId: string, incidentId: string) =>
    ["relayops", workspaceId, "incident", incidentId] as const,
  workbench: (workspaceId: string, search: WorkbenchSearch) =>
    [
      "relayops",
      workspaceId,
      "workbench",
      workbenchQueryIdentity(search),
    ] as const,
  savedViews: (workspaceId: string) =>
    ["relayops", workspaceId, "saved-views"] as const,
  legacy: (workspaceId: string) => ["relayops", workspaceId, "legacy"] as const,
};

function invalidateWorkspace(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: relayOpsKeys.workspace(workspaceId),
  });
}

export function useRelayOpsWorkspaceState(workspaceId: string) {
  return useQuery({
    queryKey: relayOpsKeys.workspaceState(workspaceId),
    queryFn: () => getRelayOpsWorkspaceState(workspaceId),
  });
}

export function useActivateRelayOpsWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => activateRelayOpsWorkspace(workspaceId),
    onSuccess: (state) => {
      queryClient.setQueryData(relayOpsKeys.workspaceState(workspaceId), state);
      void invalidateWorkspace(queryClient, workspaceId);
    },
  });
}

export function useRelayOpsServices(
  workspaceId: string,
  query: { q?: string; status?: "active" | "archived" | "all" } = {},
) {
  return useQuery({
    queryKey: relayOpsKeys.services(workspaceId, query),
    queryFn: () => listRelayOpsServices(workspaceId, query),
  });
}

export function useCreateRelayOpsService(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RelayOpsServiceInput) =>
      createRelayOpsService(workspaceId, input),
    onSuccess: (service) => {
      queryClient.setQueryData(
        relayOpsKeys.service(workspaceId, service.id),
        service,
      );
      void invalidateWorkspace(queryClient, workspaceId);
    },
  });
}

export function useRelayOpsService(workspaceId: string, serviceId: string) {
  return useQuery({
    queryKey: relayOpsKeys.service(workspaceId, serviceId),
    queryFn: () => getRelayOpsService(workspaceId, serviceId),
  });
}

export function useUpdateRelayOpsService(
  workspaceId: string,
  serviceId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RelayOpsServiceUpdate) =>
      updateRelayOpsService(workspaceId, serviceId, input),
    onSuccess: (service) => {
      queryClient.setQueryData(
        relayOpsKeys.service(workspaceId, serviceId),
        service,
      );
      void invalidateWorkspace(queryClient, workspaceId);
    },
  });
}

export function useSetRelayOpsServiceArchived(
  workspaceId: string,
  serviceId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) =>
      setRelayOpsServiceArchived(workspaceId, serviceId, archived),
    onSuccess: (service) => {
      queryClient.setQueryData(
        relayOpsKeys.service(workspaceId, serviceId),
        service,
      );
      void invalidateWorkspace(queryClient, workspaceId);
    },
  });
}

export function useRelayOpsTeams(workspaceId: string) {
  return useQuery({
    queryKey: relayOpsKeys.teams(workspaceId),
    queryFn: () => listRelayOpsTeams(workspaceId),
  });
}

export function useRelayOpsOverview(workspaceId: string) {
  return useQuery({
    queryKey: relayOpsKeys.overview(workspaceId),
    queryFn: () => getRelayOpsOverview(workspaceId),
  });
}

export function useCreateRelayOpsIncident(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      serviceId: string;
      title: string;
      summary?: string;
      severity: "unknown" | "sev1" | "sev2" | "sev3" | "sev4";
      idempotencyKey: string;
    }) => createRelayOpsIncident(workspaceId, input),
    onSuccess: (detail) => {
      queryClient.setQueryData(
        relayOpsKeys.incident(workspaceId, detail.incident.id),
        detail,
      );
      void invalidateWorkspace(queryClient, workspaceId);
    },
  });
}

export function useRelayOpsIncident(workspaceId: string, incidentId?: string) {
  return useQuery({
    queryKey: relayOpsKeys.incident(workspaceId, incidentId || "none"),
    queryFn: () => getRelayOpsIncident(workspaceId, incidentId as string),
    enabled: Boolean(incidentId),
  });
}
function useRelayOpsIncidentCommand<TInput>(
  workspaceId: string,
  incidentId: string,
  command: (input: TInput) => Promise<RelayOpsIncidentDetail>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: command,
    onSuccess: (detail) => {
      queryClient.setQueryData(
        relayOpsKeys.incident(workspaceId, incidentId),
        detail,
      );
      void invalidateWorkspace(queryClient, workspaceId);
    },
  });
}

export function useTransitionRelayOpsIncident(
  workspaceId: string,
  incidentId: string,
) {
  return useRelayOpsIncidentCommand<RelayOpsTransitionInput>(
    workspaceId,
    incidentId,
    (input) => transitionRelayOpsIncident(workspaceId, incidentId, input),
  );
}

export function useChangeRelayOpsIncidentSeverity(
  workspaceId: string,
  incidentId: string,
) {
  return useRelayOpsIncidentCommand<RelayOpsSeverityInput>(
    workspaceId,
    incidentId,
    (input) => changeRelayOpsIncidentSeverity(workspaceId, incidentId, input),
  );
}

export function usePublishRelayOpsIncidentUpdate(
  workspaceId: string,
  incidentId: string,
) {
  return useRelayOpsIncidentCommand<RelayOpsUpdateInput>(
    workspaceId,
    incidentId,
    (input) => publishRelayOpsIncidentUpdate(workspaceId, incidentId, input),
  );
}

export function useAssignRelayOpsIncidentParticipants(
  workspaceId: string,
  incidentId: string,
) {
  return useRelayOpsIncidentCommand<RelayOpsParticipantsInput>(
    workspaceId,
    incidentId,
    (input) =>
      assignRelayOpsIncidentParticipants(workspaceId, incidentId, input),
  );
}

export function useCorrectRelayOpsIncidentTimestamps(
  workspaceId: string,
  incidentId: string,
) {
  return useRelayOpsIncidentCommand<RelayOpsTimestampCorrectionInput>(
    workspaceId,
    incidentId,
    (input) =>
      correctRelayOpsIncidentTimestamps(workspaceId, incidentId, input),
  );
}

export function useRelayOpsWorkbench(
  workspaceId: string,
  search: WorkbenchSearch,
) {
  return useInfiniteQuery({
    queryKey: relayOpsKeys.workbench(workspaceId, search),
    queryFn: ({ pageParam }) =>
      listRelayOpsWorkbench(workspaceId, search, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useRelayOpsSavedViews(workspaceId: string) {
  return useQuery({
    queryKey: relayOpsKeys.savedViews(workspaceId),
    queryFn: () => listRelayOpsSavedViews(workspaceId),
  });
}

export function useCreateRelayOpsSavedView(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RelayOpsSavedViewCreateInput) =>
      createRelayOpsSavedView(workspaceId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: relayOpsKeys.savedViews(workspaceId),
      }),
  });
}

export function useUpdateRelayOpsSavedView(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: RelayOpsSavedViewUpdateInput;
    }) => updateRelayOpsSavedView(workspaceId, id, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: relayOpsKeys.savedViews(workspaceId),
      }),
  });
}

export function useDeleteRelayOpsSavedView(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      expectedVersion,
    }: {
      id: string;
      expectedVersion: number;
    }) => deleteRelayOpsSavedView(workspaceId, id, expectedVersion),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: relayOpsKeys.savedViews(workspaceId),
      }),
  });
}
export function useCreateRelayOpsDemoIncident(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      createRelayOpsDemoIncident(workspaceId, serviceId),
    onSuccess: (detail) => {
      queryClient.setQueryData(
        relayOpsKeys.incident(workspaceId, detail.incident.id),
        detail,
      );
      void invalidateWorkspace(queryClient, workspaceId);
    },
  });
}

export function useRemoveRelayOpsDemoData(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => removeRelayOpsDemoData(workspaceId),
    onSuccess: () => invalidateWorkspace(queryClient, workspaceId),
  });
}

export function useRelayOpsLegacyArchive(workspaceId: string) {
  return useQuery({
    queryKey: relayOpsKeys.legacy(workspaceId),
    queryFn: () => getRelayOpsLegacyArchive(workspaceId),
  });
}

export function useExportRelayOpsLegacyData(workspaceId: string) {
  return useMutation({
    mutationFn: () => exportRelayOpsLegacyData(workspaceId),
  });
}
