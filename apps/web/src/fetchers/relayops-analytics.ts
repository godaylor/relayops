import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import type { ReliabilityAnalyticsSearch } from "@/lib/relayops-analytics-search";
import { RelayOpsApiError } from "./relayops";

const analytics = client.relayops.workspaces[":workspaceId"].analytics;
const reliability = analytics.reliability;
const reliabilityCsv = analytics["reliability.csv"];

export type RelayOpsReliabilityAnalytics = InferResponseType<
  typeof reliability.$get,
  200
>;

function query(search: ReliabilityAnalyticsSearch) {
  return {
    from: search.from,
    to: search.to,
    timezone: search.timezone,
    status: search.status.length > 0 ? search.status.join(",") : undefined,
    severity:
      search.severity.length > 0 ? search.severity.join(",") : undefined,
    service: search.service.length > 0 ? search.service.join(",") : undefined,
    compare: String(search.compare),
    includeDemo: String(search.includeDemo),
  };
}

export async function getRelayOpsReliabilityAnalytics(
  workspaceId: string,
  search: ReliabilityAnalyticsSearch,
) {
  const response = await reliability.$get({
    param: { workspaceId },
    query: query(search),
  });
  if (response.status !== 200) {
    throw new RelayOpsApiError(await response.text(), response.status);
  }
  return response.json() as Promise<RelayOpsReliabilityAnalytics>;
}

export async function exportRelayOpsReliabilityAnalytics(
  workspaceId: string,
  search: ReliabilityAnalyticsSearch,
) {
  const response = await reliabilityCsv.$get({
    param: { workspaceId },
    query: query(search),
  });
  if (response.status !== 200) {
    throw new RelayOpsApiError(await response.text(), response.status);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] ??
    `relayops-reliability-${search.from}-${search.to}.csv`;
  return { blob: await response.blob(), filename };
}
