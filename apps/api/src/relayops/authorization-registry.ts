import type {
  PermissionMap,
  RelayOpsRoleTemplateName,
} from "@kaneo/permissions";

export const RELAYOPS_AUTHORIZATION_EXPECTATIONS = [
  "allow",
  "deny",
  "contextual",
] as const;
export type RelayOpsAuthorizationExpectation =
  (typeof RELAYOPS_AUTHORIZATION_EXPECTATIONS)[number];

export type RelayOpsAuthorizationAlternative = {
  permissions: PermissionMap;
  scope: "workspace" | "primary_service_owned";
};

export type RelayOpsAuthorizationContract = {
  operationId: string;
  method: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
  alternatives: readonly RelayOpsAuthorizationAlternative[];
  context?: "saved_view_owner_or_share";
  role: Record<RelayOpsRoleTemplateName, RelayOpsAuthorizationExpectation>;
  apiKey: {
    omitted: "deny";
    malformed: "deny";
    unknownScope: "deny";
    matchingScope: "allow_if_member_role_allows";
  };
};

const allAllow = {
  viewer: "allow",
  responder: "allow",
  incident_commander: "allow",
  service_owner: "allow",
  workspace_admin: "allow",
} as const;

const adminOnly = {
  viewer: "deny",
  responder: "deny",
  incident_commander: "deny",
  service_owner: "deny",
  workspace_admin: "allow",
} as const;

const operators = {
  viewer: "deny",
  responder: "allow",
  incident_commander: "allow",
  service_owner: "allow",
  workspace_admin: "allow",
} as const;

const apiKey = {
  omitted: "deny",
  malformed: "deny",
  unknownScope: "deny",
  matchingScope: "allow_if_member_role_allows",
} as const;

const workspace = (permissions: PermissionMap) =>
  [{ permissions, scope: "workspace" }] as const;

const workspaceOrOwned = (direct: PermissionMap, owned: PermissionMap) =>
  [
    { permissions: direct, scope: "workspace" },
    { permissions: owned, scope: "primary_service_owned" },
  ] as const;

export const RELAYOPS_AUTHORIZATION_REGISTRY = [
  {
    operationId: "getRelayOpsWorkspaceState",
    method: "GET",
    path: "/workspaces/{workspaceId}",
    alternatives: workspace({ workspace: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "activateRelayOpsWorkspace",
    method: "POST",
    path: "/workspaces/{workspaceId}/activate",
    alternatives: workspace({ workspace: ["update"] }),
    role: adminOnly,
    apiKey,
  },
  {
    operationId: "listRelayOpsServices",
    method: "GET",
    path: "/workspaces/{workspaceId}/services",
    alternatives: workspace({ service: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "createRelayOpsService",
    method: "POST",
    path: "/workspaces/{workspaceId}/services",
    alternatives: workspace({ service: ["create"] }),
    role: adminOnly,
    apiKey,
  },
  {
    operationId: "getRelayOpsService",
    method: "GET",
    path: "/workspaces/{workspaceId}/services/{id}",
    alternatives: workspace({ service: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "updateRelayOpsService",
    method: "PATCH",
    path: "/workspaces/{workspaceId}/services/{id}",
    alternatives: workspaceOrOwned(
      { service: ["update"] },
      { service: ["update_owned"] },
    ),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "deny",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "archiveRelayOpsService",
    method: "POST",
    path: "/workspaces/{workspaceId}/services/{id}/archive",
    alternatives: workspaceOrOwned(
      { service: ["archive"] },
      { service: ["archive_owned"] },
    ),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "deny",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "unarchiveRelayOpsService",
    method: "POST",
    path: "/workspaces/{workspaceId}/services/{id}/unarchive",
    alternatives: workspaceOrOwned(
      { service: ["archive"] },
      { service: ["archive_owned"] },
    ),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "deny",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "listRelayOpsServiceOwnerTeams",
    method: "GET",
    path: "/workspaces/{workspaceId}/teams",
    alternatives: workspace({ service: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "getRelayOpsOverview",
    method: "GET",
    path: "/workspaces/{workspaceId}/overview",
    alternatives: workspace({
      service: ["read"],
      incident: ["read"],
    }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "createRelayOpsDemoIncident",
    method: "POST",
    path: "/workspaces/{workspaceId}/demo-data",
    alternatives: workspace({ incident: ["create"] }),
    role: operators,
    apiKey,
  },
  {
    operationId: "deleteRelayOpsDemoData",
    method: "DELETE",
    path: "/workspaces/{workspaceId}/demo-data",
    alternatives: workspace({ workspace: ["update"] }),
    role: adminOnly,
    apiKey,
  },
  {
    operationId: "getRelayOpsLegacyArchive",
    method: "GET",
    path: "/workspaces/{workspaceId}/legacy",
    alternatives: workspace({ project: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "exportRelayOpsLegacyArchive",
    method: "GET",
    path: "/workspaces/{workspaceId}/legacy/export",
    alternatives: workspace({
      project: ["read"],
      analytics: ["export"],
    }),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "allow",
      service_owner: "allow",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "getRelayOpsReliabilityAnalytics",
    method: "GET",
    path: "/workspaces/{workspaceId}/analytics/reliability",
    alternatives: workspace({ analytics: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "exportRelayOpsReliabilityAnalytics",
    method: "GET",
    path: "/workspaces/{workspaceId}/analytics/reliability.csv",
    alternatives: workspace({ analytics: ["export"] }),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "allow",
      service_owner: "allow",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "listRelayOpsIncidents",
    method: "GET",
    path: "/workspaces/{workspaceId}/incidents",
    alternatives: workspace({ incident: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "createRelayOpsIncident",
    method: "POST",
    path: "/workspaces/{workspaceId}/incidents",
    alternatives: workspace({ incident: ["create"] }),
    role: operators,
    apiKey,
  },
  {
    operationId: "getRelayOpsIncident",
    method: "GET",
    path: "/workspaces/{workspaceId}/incidents/{id}",
    alternatives: workspace({ incident: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "transitionRelayOpsIncident",
    method: "POST",
    path: "/workspaces/{workspaceId}/incidents/{id}/transition",
    alternatives: [
      { permissions: { incident: ["transition"] }, scope: "workspace" },
      {
        permissions: { incident: ["transition_owned"] },
        scope: "primary_service_owned",
      },
      { permissions: { incident: ["resolve"] }, scope: "workspace" },
      {
        permissions: { incident: ["resolve_owned"] },
        scope: "primary_service_owned",
      },
      { permissions: { incident: ["reopen"] }, scope: "workspace" },
      {
        permissions: { incident: ["reopen_owned"] },
        scope: "primary_service_owned",
      },
      { permissions: { incident: ["dismiss"] }, scope: "workspace" },
      {
        permissions: { incident: ["dismiss_owned"] },
        scope: "primary_service_owned",
      },
    ],
    role: {
      viewer: "deny",
      responder: "allow",
      incident_commander: "allow",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "changeRelayOpsIncidentSeverity",
    method: "POST",
    path: "/workspaces/{workspaceId}/incidents/{id}/severity",
    alternatives: workspaceOrOwned(
      { incident: ["severity"] },
      { incident: ["severity_owned"] },
    ),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "allow",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "publishRelayOpsIncidentUpdate",
    method: "POST",
    path: "/workspaces/{workspaceId}/incidents/{id}/updates",
    alternatives: workspace({ incident_timeline: ["publish"] }),
    role: operators,
    apiKey,
  },
  {
    operationId: "assignRelayOpsIncidentParticipants",
    method: "POST",
    path: "/workspaces/{workspaceId}/incidents/{id}/participants",
    alternatives: workspaceOrOwned(
      { incident: ["assign"] },
      { incident: ["assign_owned"] },
    ),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "allow",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "correctRelayOpsIncidentTimestamps",
    method: "POST",
    path: "/workspaces/{workspaceId}/incidents/{id}/timestamps/correct",
    alternatives: workspace({ incident_timeline: ["correct"] }),
    role: {
      viewer: "deny",
      responder: "deny",
      incident_commander: "allow",
      service_owner: "deny",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "listRelayOpsIncidentTimeline",
    method: "GET",
    path: "/workspaces/{workspaceId}/incidents/{id}/timeline",
    alternatives: workspace({ incident_timeline: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "listRelayOpsSavedViews",
    method: "GET",
    path: "/workspaces/{workspaceId}/saved-views",
    alternatives: workspace({ saved_view: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "createRelayOpsSavedView",
    method: "POST",
    path: "/workspaces/{workspaceId}/saved-views",
    alternatives: workspace({ saved_view: ["create"] }),
    role: operators,
    apiKey,
  },
  {
    operationId: "updateRelayOpsSavedView",
    method: "PATCH",
    path: "/workspaces/{workspaceId}/saved-views/{id}",
    alternatives: workspace({ saved_view: ["update"] }),
    context: "saved_view_owner_or_share",
    role: {
      viewer: "deny",
      responder: "contextual",
      incident_commander: "allow",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "deleteRelayOpsSavedView",
    method: "DELETE",
    path: "/workspaces/{workspaceId}/saved-views/{id}",
    alternatives: workspace({ saved_view: ["delete"] }),
    context: "saved_view_owner_or_share",
    role: {
      viewer: "deny",
      responder: "contextual",
      incident_commander: "allow",
      service_owner: "contextual",
      workspace_admin: "allow",
    },
    apiKey,
  },
  {
    operationId: "listRelayOpsSignals",
    method: "GET",
    path: "/workspaces/{workspaceId}/signals",
    alternatives: workspace({ signal: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "createRelayOpsManualSignal",
    method: "POST",
    path: "/workspaces/{workspaceId}/signals",
    alternatives: workspace({ signal: ["create"] }),
    role: operators,
    apiKey,
  },
  {
    operationId: "createRelayOpsDemoSignal",
    method: "POST",
    path: "/workspaces/{workspaceId}/signals/demo",
    alternatives: workspace({ signal: ["create"] }),
    role: operators,
    apiKey,
  },
  {
    operationId: "getRelayOpsSignal",
    method: "GET",
    path: "/workspaces/{workspaceId}/signals/{id}",
    alternatives: workspace({ signal: ["read"] }),
    role: allAllow,
    apiKey,
  },
  {
    operationId: "listRelayOpsSignalSources",
    method: "GET",
    path: "/workspaces/{workspaceId}/signal-sources",
    alternatives: workspace({ signal: ["ingest"] }),
    role: adminOnly,
    apiKey,
  },
  {
    operationId: "createRelayOpsSignalSource",
    method: "POST",
    path: "/workspaces/{workspaceId}/signal-sources",
    alternatives: workspace({ signal: ["ingest"] }),
    role: adminOnly,
    apiKey,
  },
  {
    operationId: "rotateRelayOpsSignalSourceSecret",
    method: "POST",
    path: "/workspaces/{workspaceId}/signal-sources/{sourceId}/rotate-secret",
    alternatives: workspace({ signal: ["ingest"] }),
    role: adminOnly,
    apiKey,
  },
  {
    operationId: "attachRelayOpsSignal",
    method: "POST",
    path: "/workspaces/{workspaceId}/incidents/{incidentId}/signals/{signalId}",
    alternatives: workspace({ signal: ["attach"], incident: ["read"] }),
    role: operators,
    apiKey,
  },
] as const satisfies readonly RelayOpsAuthorizationContract[];

export type RelayOpsAuthorizationOperationId =
  (typeof RELAYOPS_AUTHORIZATION_REGISTRY)[number]["operationId"];

export function getRelayOpsAuthorizationContract(
  operationId: string,
): RelayOpsAuthorizationContract | null {
  return (
    RELAYOPS_AUTHORIZATION_REGISTRY.find(
      (entry) => entry.operationId === operationId,
    ) ?? null
  );
}
