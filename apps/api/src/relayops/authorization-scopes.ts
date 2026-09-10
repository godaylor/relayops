import {
  normalizePermissionMap,
  type PermissionMap,
  permissionMapSatisfies,
} from "@kaneo/permissions";
import type {
  RelayOpsAuthorizationAlternative,
  RelayOpsAuthorizationContract,
} from "./authorization-registry";

export function relayOpsApiKeyScopesAllow(
  rawScopes: unknown,
  alternatives: readonly RelayOpsAuthorizationAlternative[],
): boolean {
  const scopes = normalizePermissionMap(rawScopes);
  if (!scopes || alternatives.length === 0) {
    return false;
  }
  return alternatives.some((alternative) =>
    permissionMapSatisfies(scopes, alternative.permissions),
  );
}

export function relayOpsApiKeyAllowsOperation(
  rawScopes: unknown,
  contract: Pick<RelayOpsAuthorizationContract, "alternatives">,
): boolean {
  return relayOpsApiKeyScopesAllow(rawScopes, contract.alternatives);
}

export function matchingApiKeyScopes(
  alternative: RelayOpsAuthorizationAlternative,
): PermissionMap {
  return alternative.permissions;
}
