import { type PermissionMap, permissionMapSatisfies } from "@kaneo/permissions";

export type RelayOpsUiSurface = "action" | "command" | "nav" | "route";
export type RelayOpsUiScope =
  | "workspace"
  | "primary_service_owned"
  | "saved_view_owner_or_share";

export type RelayOpsUiCapabilityAlternative = {
  permissions: PermissionMap;
  scope: RelayOpsUiScope;
};

export type RelayOpsUiCapabilityContext = {
  primaryServiceOwned?: boolean;
  savedViewOwnerOrShare?: boolean;
};

export type RelayOpsUiRegistryItem = {
  id: string;
  apiOperationIds: readonly string[];
  surfaces: readonly RelayOpsUiSurface[];
  alternatives: readonly RelayOpsUiCapabilityAlternative[];
};

const workspace = (permissions: PermissionMap) =>
  [{ permissions, scope: "workspace" }] as const;

const workspaceOrOwned = (direct: PermissionMap, owned: PermissionMap) =>
  [
    { permissions: direct, scope: "workspace" },
    { permissions: owned, scope: "primary_service_owned" },
  ] as const;

export const RELAYOPS_UI_CAPABILITY_REGISTRY = [
  {
    id: "route.overview",
    apiOperationIds: ["getRelayOpsOverview"],
    surfaces: ["route", "nav"],
    alternatives: workspace({
      service: ["read"],
      incident: ["read"],
    }),
  },
  {
    id: "route.workbench",
    apiOperationIds: ["listRelayOpsIncidents"],
    surfaces: ["route", "nav"],
    alternatives: workspace({ incident: ["read"] }),
  },
  {
    id: "route.board",
    apiOperationIds: ["listRelayOpsIncidents"],
    surfaces: ["route", "nav"],
    alternatives: workspace({ incident: ["read"] }),
  },
  {
    id: "route.services",
    apiOperationIds: ["listRelayOpsServices"],
    surfaces: ["route", "nav"],
    alternatives: workspace({ service: ["read"] }),
  },
  {
    id: "action.incident.create",
    apiOperationIds: ["createRelayOpsIncident"],
    surfaces: ["action", "command"],
    alternatives: workspace({ incident: ["create"] }),
  },
  {
    id: "action.incident.transition",
    apiOperationIds: ["transitionRelayOpsIncident"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { incident: ["transition"] },
      { incident: ["transition_owned"] },
    ),
  },
  {
    id: "action.incident.assign",
    apiOperationIds: ["assignRelayOpsIncidentParticipants"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { incident: ["assign"] },
      { incident: ["assign_owned"] },
    ),
  },
  {
    id: "action.incident.severity",
    apiOperationIds: ["changeRelayOpsIncidentSeverity"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { incident: ["severity"] },
      { incident: ["severity_owned"] },
    ),
  },
  {
    id: "action.incident.resolve",
    apiOperationIds: ["transitionRelayOpsIncident"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { incident: ["resolve"] },
      { incident: ["resolve_owned"] },
    ),
  },
  {
    id: "action.incident.reopen",
    apiOperationIds: ["transitionRelayOpsIncident"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { incident: ["reopen"] },
      { incident: ["reopen_owned"] },
    ),
  },
  {
    id: "action.incident.dismiss",
    apiOperationIds: ["transitionRelayOpsIncident"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { incident: ["dismiss"] },
      { incident: ["dismiss_owned"] },
    ),
  },
  {
    id: "action.timeline.publish",
    apiOperationIds: ["publishRelayOpsIncidentUpdate"],
    surfaces: ["action", "command"],
    alternatives: workspace({ incident_timeline: ["publish"] }),
  },
  {
    id: "action.timeline.correct",
    apiOperationIds: ["correctRelayOpsIncidentTimestamps"],
    surfaces: ["action", "command"],
    alternatives: workspace({ incident_timeline: ["correct"] }),
  },
  {
    id: "action.service.create",
    apiOperationIds: ["createRelayOpsService"],
    surfaces: ["action", "command"],
    alternatives: workspace({ service: ["create"] }),
  },
  {
    id: "action.service.update",
    apiOperationIds: ["updateRelayOpsService"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { service: ["update"] },
      { service: ["update_owned"] },
    ),
  },
  {
    id: "action.service.archive",
    apiOperationIds: ["archiveRelayOpsService", "unarchiveRelayOpsService"],
    surfaces: ["action", "command"],
    alternatives: workspaceOrOwned(
      { service: ["archive"] },
      { service: ["archive_owned"] },
    ),
  },
  {
    id: "action.savedView.create",
    apiOperationIds: ["createRelayOpsSavedView"],
    surfaces: ["action", "command"],
    alternatives: workspace({ saved_view: ["create"] }),
  },
  {
    id: "action.savedView.update",
    apiOperationIds: ["updateRelayOpsSavedView"],
    surfaces: ["action", "command"],
    alternatives: [
      {
        permissions: { saved_view: ["update", "share"] },
        scope: "workspace",
      },
      {
        permissions: { saved_view: ["update"] },
        scope: "saved_view_owner_or_share",
      },
    ],
  },
  {
    id: "action.savedView.delete",
    apiOperationIds: ["deleteRelayOpsSavedView"],
    surfaces: ["action", "command"],
    alternatives: [
      {
        permissions: { saved_view: ["delete", "share"] },
        scope: "workspace",
      },
      {
        permissions: { saved_view: ["delete"] },
        scope: "saved_view_owner_or_share",
      },
    ],
  },
  {
    id: "route.analytics",
    apiOperationIds: ["getRelayOpsReliabilityAnalytics"],
    surfaces: ["route", "nav"],
    alternatives: workspace({ analytics: ["read"] }),
  },
  {
    id: "action.analytics.export",
    apiOperationIds: ["exportRelayOpsReliabilityAnalytics"],
    surfaces: ["action", "command"],
    alternatives: workspace({ analytics: ["export"] }),
  },
  {
    id: "action.legacy.export",
    apiOperationIds: ["exportRelayOpsLegacyArchive"],
    surfaces: ["action", "command"],
    alternatives: workspace({
      project: ["read"],
      analytics: ["export"],
    }),
  },
  {
    id: "route.legacy",
    apiOperationIds: ["getRelayOpsLegacyArchive"],
    surfaces: ["route", "nav"],
    alternatives: workspace({ project: ["read"] }),
  },
  {
    id: "action.signal.create",
    apiOperationIds: ["createRelayOpsManualSignal", "createRelayOpsDemoSignal"],
    surfaces: ["action", "command"],
    alternatives: workspace({ signal: ["create"] }),
  },
  {
    id: "action.signal.attach",
    apiOperationIds: ["attachRelayOpsSignal"],
    surfaces: ["action", "command"],
    alternatives: workspace({ signal: ["attach"], incident: ["read"] }),
  },
  {
    id: "action.workspace.activate",
    apiOperationIds: ["activateRelayOpsWorkspace"],
    surfaces: ["action"],
    alternatives: workspace({ workspace: ["update"] }),
  },
  {
    id: "action.demo.cleanup",
    apiOperationIds: ["deleteRelayOpsDemoData"],
    surfaces: ["action"],
    alternatives: workspace({ workspace: ["update"] }),
  },
] as const satisfies readonly RelayOpsUiRegistryItem[];

export type RelayOpsUiCapabilityId =
  (typeof RELAYOPS_UI_CAPABILITY_REGISTRY)[number]["id"];

export function relayOpsUiContextAllows(
  scope: RelayOpsUiScope,
  context: RelayOpsUiCapabilityContext,
) {
  if (scope === "workspace") return true;
  if (scope === "primary_service_owned") {
    return context.primaryServiceOwned === true;
  }
  return context.savedViewOwnerOrShare === true;
}

export function canDiscoverRelayOpsUiItem(
  grants: unknown,
  id: string,
  context: RelayOpsUiCapabilityContext = {},
): boolean {
  const item = RELAYOPS_UI_CAPABILITY_REGISTRY.find((entry) => entry.id === id);
  if (!item) return false;

  return item.alternatives.some(
    (alternative) =>
      permissionMapSatisfies(grants, alternative.permissions) &&
      relayOpsUiContextAllows(alternative.scope, context),
  );
}

export function getRelayOpsUiRegistryItem(
  id: string,
): RelayOpsUiRegistryItem | null {
  return (
    RELAYOPS_UI_CAPABILITY_REGISTRY.find((entry) => entry.id === id) ?? null
  );
}
