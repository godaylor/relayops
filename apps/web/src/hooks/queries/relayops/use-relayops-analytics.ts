import { useMutation, useQuery } from "@tanstack/react-query";
import {
  exportRelayOpsReliabilityAnalytics,
  getRelayOpsReliabilityAnalytics,
} from "@/fetchers/relayops-analytics";
import {
  type ReliabilityAnalyticsSearch,
  serializeReliabilityAnalyticsSearch,
} from "@/lib/relayops-analytics-search";

export function useRelayOpsReliabilityAnalytics(
  workspaceId: string,
  search: ReliabilityAnalyticsSearch,
) {
  return useQuery({
    queryKey: [
      "relayops",
      workspaceId,
      "reliability",
      serializeReliabilityAnalyticsSearch(search),
    ],
    queryFn: () => getRelayOpsReliabilityAnalytics(workspaceId, search),
  });
}

export function useExportRelayOpsReliabilityAnalytics(
  workspaceId: string,
  search: ReliabilityAnalyticsSearch,
) {
  return useMutation({
    mutationFn: () => exportRelayOpsReliabilityAnalytics(workspaceId, search),
  });
}
