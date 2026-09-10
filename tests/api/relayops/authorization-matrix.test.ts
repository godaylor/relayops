import { describe, expect, it } from "vitest";
import {
  RELAYOPS_AUTHORIZATION_EXPECTATIONS,
  RELAYOPS_AUTHORIZATION_REGISTRY,
  type RelayOpsAuthorizationContract,
  type RelayOpsAuthorizationExpectation,
} from "../../../apps/api/src/relayops/authorization-registry";
import { relayOpsApiKeyAllowsOperation } from "../../../apps/api/src/relayops/authorization-scopes";
import { RELAYOPS_UI_CAPABILITY_REGISTRY } from "../../../apps/web/src/lib/relayops-capabilities";
import {
  permissionMapSatisfies,
  RELAYOPS_ROLE_TEMPLATE_NAMES,
  type RelayOpsRoleTemplateName,
  relayOpsRoleTemplatePayloads,
} from "../../../packages/permissions/src/index";

const expectedOperationIds = [
  "getRelayOpsWorkspaceState",
  "activateRelayOpsWorkspace",
  "listRelayOpsServices",
  "createRelayOpsService",
  "getRelayOpsService",
  "updateRelayOpsService",
  "archiveRelayOpsService",
  "unarchiveRelayOpsService",
  "listRelayOpsServiceOwnerTeams",
  "getRelayOpsOverview",
  "createRelayOpsDemoIncident",
  "deleteRelayOpsDemoData",
  "getRelayOpsLegacyArchive",
  "exportRelayOpsLegacyArchive",
  "getRelayOpsReliabilityAnalytics",
  "exportRelayOpsReliabilityAnalytics",
  "listRelayOpsIncidents",
  "createRelayOpsIncident",
  "getRelayOpsIncident",
  "transitionRelayOpsIncident",
  "changeRelayOpsIncidentSeverity",
  "publishRelayOpsIncidentUpdate",
  "assignRelayOpsIncidentParticipants",
  "correctRelayOpsIncidentTimestamps",
  "listRelayOpsIncidentTimeline",
  "listRelayOpsSavedViews",
  "createRelayOpsSavedView",
  "updateRelayOpsSavedView",
  "deleteRelayOpsSavedView",
  "listRelayOpsSignals",
  "createRelayOpsManualSignal",
  "createRelayOpsDemoSignal",
  "getRelayOpsSignal",
  "listRelayOpsSignalSources",
  "createRelayOpsSignalSource",
  "rotateRelayOpsSignalSourceSecret",
  "attachRelayOpsSignal",
] as const;

function observedRoleExpectation(
  contract: RelayOpsAuthorizationContract,
  roleName: RelayOpsRoleTemplateName,
): RelayOpsAuthorizationExpectation {
  const grants = relayOpsRoleTemplatePayloads[roleName];
  const direct = contract.alternatives.some(
    (alternative) =>
      alternative.scope === "workspace" &&
      permissionMapSatisfies(grants, alternative.permissions),
  );
  const owned = contract.alternatives.some(
    (alternative) =>
      alternative.scope === "primary_service_owned" &&
      permissionMapSatisfies(grants, alternative.permissions),
  );

  if (contract.context === "saved_view_owner_or_share") {
    if (direct && permissionMapSatisfies(grants, { saved_view: ["share"] })) {
      return "allow";
    }
    return direct ? "contextual" : "deny";
  }

  if (direct) return "allow";
  if (owned) return "contextual";
  return "deny";
}

describe("RelayOps endpoint x role x API-key authorization matrix", () => {
  it("enumerates the complete protected S1-S9 operation contract exactly once", () => {
    expect(
      RELAYOPS_AUTHORIZATION_REGISTRY.map((entry) => entry.operationId),
    ).toEqual(expectedOperationIds);

    const operationIds = new Set<string>();
    const routes = new Set<string>();
    for (const entry of RELAYOPS_AUTHORIZATION_REGISTRY) {
      expect(operationIds.has(entry.operationId)).toBe(false);
      operationIds.add(entry.operationId);

      const routeKey = `${entry.method} ${entry.path}`;
      expect(routes.has(routeKey)).toBe(false);
      routes.add(routeKey);
    }
  });

  it("has an explicit non-unknown expectation for every endpoint and role", () => {
    let rows = 0;
    for (const entry of RELAYOPS_AUTHORIZATION_REGISTRY) {
      expect(Object.keys(entry.role)).toEqual([
        ...RELAYOPS_ROLE_TEMPLATE_NAMES,
      ]);
      for (const roleName of RELAYOPS_ROLE_TEMPLATE_NAMES) {
        expect(RELAYOPS_AUTHORIZATION_EXPECTATIONS).toContain(
          entry.role[roleName],
        );
        expect(entry.role[roleName]).toBe(
          observedRoleExpectation(entry, roleName),
        );
        rows += 1;
      }
    }
    expect(rows).toBe(
      RELAYOPS_AUTHORIZATION_REGISTRY.length *
        RELAYOPS_ROLE_TEMPLATE_NAMES.length,
    );
  });

  it("requires valid matching API-key scopes for every protected operation", () => {
    for (const entry of RELAYOPS_AUTHORIZATION_REGISTRY) {
      expect(entry.apiKey).toEqual({
        omitted: "deny",
        malformed: "deny",
        unknownScope: "deny",
        matchingScope: "allow_if_member_role_allows",
      });
      expect(relayOpsApiKeyAllowsOperation(null, entry)).toBe(false);
      expect(relayOpsApiKeyAllowsOperation({}, entry)).toBe(false);
      expect(
        relayOpsApiKeyAllowsOperation(
          { unknown_resource: ["wildcard"] },
          entry,
        ),
      ).toBe(false);

      for (const alternative of entry.alternatives) {
        expect(
          relayOpsApiKeyAllowsOperation(alternative.permissions, entry),
        ).toBe(true);
      }
    }
  });

  it("treats API-key scope as an intersection, never as role elevation", () => {
    const transition = RELAYOPS_AUTHORIZATION_REGISTRY.find(
      (entry) => entry.operationId === "transitionRelayOpsIncident",
    );
    expect(transition).toBeDefined();
    if (!transition) return;

    const matchingScope = { incident: ["transition"] };
    expect(relayOpsApiKeyAllowsOperation(matchingScope, transition)).toBe(true);
    expect(observedRoleExpectation(transition, "viewer")).toBe("deny");
    expect(observedRoleExpectation(transition, "responder")).toBe("allow");
  });

  it("has no UI route/action/command item orphaned from an API operation", () => {
    const apiOperations = new Set(
      RELAYOPS_AUTHORIZATION_REGISTRY.map((entry) => entry.operationId),
    );
    for (const item of RELAYOPS_UI_CAPABILITY_REGISTRY) {
      expect(item.apiOperationIds.length).toBeGreaterThan(0);
      for (const operationId of item.apiOperationIds) {
        expect(apiOperations.has(operationId)).toBe(true);
      }
    }
  });
});
