export type RelayOpsSearch = {
  incidentId?: string;
  tab: "timeline";
};

export function parseRelayOpsSearch(
  search: Record<string, unknown>,
): RelayOpsSearch {
  const incidentId =
    typeof search.incidentId === "string" && search.incidentId.trim()
      ? search.incidentId
      : undefined;
  return {
    incidentId,
    tab: search.tab === "timeline" ? "timeline" : "timeline",
  };
}
