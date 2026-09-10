import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachRelayOpsSignal,
  createRelayOpsDemoSignal,
  createRelayOpsManualSignal,
  listRelayOpsSignals,
  type RelayOpsManualSignalInput,
  type RelayOpsSignalAttachmentInput,
} from "@/fetchers/relayops";
import { relayOpsKeys } from "./use-relayops";

export const relayOpsSignalKeys = {
  list: (workspaceId: string) => ["relayops", workspaceId, "signals"] as const,
};

export function useRelayOpsSignals(workspaceId: string) {
  return useQuery({
    queryKey: relayOpsSignalKeys.list(workspaceId),
    queryFn: () => listRelayOpsSignals(workspaceId),
  });
}

function useSignalMutation<TInput>(
  workspaceId: string,
  mutationFn: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: relayOpsSignalKeys.list(workspaceId),
      });
      void queryClient.invalidateQueries({
        queryKey: relayOpsKeys.workspace(workspaceId),
      });
    },
  });
}

export function useCreateRelayOpsManualSignal(workspaceId: string) {
  return useSignalMutation<RelayOpsManualSignalInput>(workspaceId, (input) =>
    createRelayOpsManualSignal(workspaceId, input),
  );
}

export function useCreateRelayOpsDemoSignal(workspaceId: string) {
  return useSignalMutation<string>(workspaceId, (serviceId) =>
    createRelayOpsDemoSignal(workspaceId, serviceId),
  );
}

export function useAttachRelayOpsSignal(
  workspaceId: string,
  incidentId: string,
) {
  return useSignalMutation<
    RelayOpsSignalAttachmentInput & { signalId: string }
  >(workspaceId, ({ signalId, ...input }) =>
    attachRelayOpsSignal(workspaceId, incidentId, signalId, input),
  );
}
