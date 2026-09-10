import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  service: [
    "create",
    "read",
    "update",
    "update_owned",
    "archive",
    "archive_owned",
  ],
  incident: [
    "create",
    "read",
    "update",
    "update_owned",
    "transition",
    "transition_owned",
    "assign",
    "assign_owned",
    "severity",
    "severity_owned",
    "resolve",
    "resolve_owned",
    "reopen",
    "reopen_owned",
    "dismiss",
    "dismiss_owned",
  ],
  incident_timeline: ["read", "publish", "correct"],
  signal: ["create", "read", "ingest", "attach"],
  saved_view: ["create", "read", "update", "delete", "share"],
  analytics: ["read", "export"],
  workspace: ["read", "update", "delete", "manage_settings"],
} as const;

export const ac = createAccessControl(statement);

export const viewer = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  task: ["read"],
  label: ["read"],
  incident_timeline: ["read"],
  signal: ["read"],
  saved_view: ["read"],
  analytics: ["read"],
  service: ["read"],
  incident: ["read"],
  workspace: ["read"],
});

export const member = ac.newRole({
  ...memberAc.statements,
  project: ["create", "read"],
  task: ["create", "read", "update"],
  label: ["create", "read", "update", "delete"],
  service: ["read"],
  incident: ["read"],
  workspace: ["read"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  service: ["create", "read"],
  incident: ["create", "read"],
  workspace: ["read", "update", "manage_settings"],
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  service: [...statement.service],
  incident: [...statement.incident],
  incident_timeline: [...statement.incident_timeline],
  signal: [...statement.signal],
  saved_view: [...statement.saved_view],
  analytics: [...statement.analytics],
  workspace: ["read", "update", "delete", "manage_settings"],
});

export const builtInRoles = { viewer, member, admin, owner } as const;
export const responder = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  task: ["read"],
  label: ["read"],
  service: ["read"],
  incident: ["create", "read", "update", "transition"],
  incident_timeline: ["read", "publish"],
  signal: ["create", "read", "attach"],
  saved_view: ["create", "read", "update", "delete"],
  analytics: ["read"],
  workspace: ["read"],
});

export const incidentCommander = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  task: ["read"],
  label: ["read"],
  service: ["read"],
  incident: [
    "create",
    "read",
    "update",
    "transition",
    "assign",
    "severity",
    "resolve",
    "reopen",
    "dismiss",
  ],
  incident_timeline: ["read", "publish", "correct"],
  signal: ["create", "read", "attach"],
  saved_view: ["create", "read", "update", "delete", "share"],
  analytics: ["read", "export"],
  workspace: ["read"],
});

export const serviceOwner = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  task: ["read"],
  label: ["read"],
  service: ["read", "update_owned", "archive_owned"],
  incident: [
    "create",
    "read",
    "update_owned",
    "transition_owned",
    "assign_owned",
    "severity_owned",
    "resolve_owned",
    "reopen_owned",
    "dismiss_owned",
  ],
  incident_timeline: ["read", "publish"],
  signal: ["create", "read", "attach"],
  saved_view: ["create", "read", "update", "delete"],
  analytics: ["read", "export"],
  workspace: ["read"],
});

export const workspaceAdmin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  service: ["create", "read", "update", "archive"],
  incident: [
    "create",
    "read",
    "update",
    "transition",
    "assign",
    "severity",
    "resolve",
    "reopen",
    "dismiss",
  ],
  incident_timeline: ["read", "publish", "correct"],
  signal: ["create", "read", "ingest", "attach"],
  saved_view: ["create", "read", "update", "delete", "share"],
  analytics: ["read", "export"],
  workspace: ["read", "update", "manage_settings"],
});

export const RELAYOPS_ROLE_TEMPLATE_NAMES = [
  "viewer",
  "responder",
  "incident_commander",
  "service_owner",
  "workspace_admin",
] as const;
export type RelayOpsRoleTemplateName =
  (typeof RELAYOPS_ROLE_TEMPLATE_NAMES)[number];

export const relayOpsRoleTemplates = {
  viewer,
  responder,
  incident_commander: incidentCommander,
  service_owner: serviceOwner,
  workspace_admin: workspaceAdmin,
} as const;

export type BuiltInRoleName = keyof typeof builtInRoles;

// Default-role names that the API seeds per workspace. These ARE editable in
// the UI (their permissions live as rows in `workspace_role`), but their names
// are reserved and the rows are auto-created on workspace creation /
// backfilled at boot. `owner` is intentionally NOT in this list because it
// stays a true static role on the better-auth side.
export const DEFAULT_ROLE_NAMES = ["viewer", "member", "admin"] as const;
export type DefaultRoleName = (typeof DEFAULT_ROLE_NAMES)[number];

function toMutablePayload(
  statements: Record<string, readonly string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(statements)) {
    out[resource] = [...actions];
  }
  return out;
}
export const PRE_S7_GENERATED_VIEWER_PAYLOAD = toMutablePayload({
  ...memberAc.statements,
  project: ["read"],
  task: ["read"],
  label: ["read"],
  service: ["read"],
  incident: ["read"],
  workspace: ["read"],
});

// Plain JSON-serializable permission payloads for the seeded default roles.
// Mirrors each role's `.statements` (including better-auth's organization/
// member/team/invitation/ac defaults) so a workspace_role row that uses one
// of these has parity with the prior static definition.

export const relayOpsRoleTemplatePayloads: Record<
  RelayOpsRoleTemplateName,
  Record<string, string[]>
> = {
  viewer: toMutablePayload(viewer.statements),
  responder: toMutablePayload(responder.statements),
  incident_commander: toMutablePayload(incidentCommander.statements),
  service_owner: toMutablePayload(serviceOwner.statements),
  workspace_admin: toMutablePayload(workspaceAdmin.statements),
};

export type PermissionMap = Record<string, readonly string[]>;

export function normalizePermissionMap(
  value: unknown,
): Record<string, string[]> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const normalized: Record<string, string[]> = {};
  for (const [resource, rawActions] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Object.hasOwn(statement, resource) || !Array.isArray(rawActions)) {
      return null;
    }

    const allowed = statement[
      resource as keyof typeof statement
    ] as readonly string[];
    const actions = new Set<string>();
    for (const action of rawActions) {
      if (typeof action !== "string" || !allowed.includes(action)) {
        return null;
      }
      actions.add(action);
    }
    normalized[resource] = [...actions];
  }

  return normalized;
}

export function isPreS7GeneratedViewerPayload(value: unknown): boolean {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return false;
    }
  }

  const candidate = normalizePermissionMap(parsed);
  const expected = normalizePermissionMap(PRE_S7_GENERATED_VIEWER_PAYLOAD);
  if (!candidate || !expected) return false;

  const candidateResources = Object.keys(candidate).sort();
  const expectedResources = Object.keys(expected).sort();
  if (
    candidateResources.length !== expectedResources.length ||
    candidateResources.some(
      (resource, index) => resource !== expectedResources[index],
    )
  ) {
    return false;
  }

  return expectedResources.every((resource) => {
    const actualActions = [...(candidate[resource] ?? [])].sort();
    const expectedActions = [...(expected[resource] ?? [])].sort();
    return (
      actualActions.length === expectedActions.length &&
      actualActions.every((action, index) => action === expectedActions[index])
    );
  });
}

export function permissionMapSatisfies(
  granted: unknown,
  required: PermissionMap,
): boolean {
  const normalizedGranted = normalizePermissionMap(granted);
  const normalizedRequired = normalizePermissionMap(required);
  if (!normalizedGranted || !normalizedRequired) {
    return false;
  }

  for (const [resource, actions] of Object.entries(normalizedRequired)) {
    const grantedActions = normalizedGranted[resource];
    if (!grantedActions) return false;
    for (const action of actions) {
      if (!grantedActions.includes(action)) return false;
    }
  }
  return true;
}

export function permissionMapSatisfiesAny(
  granted: unknown,
  alternatives: readonly PermissionMap[],
): boolean {
  if (alternatives.length === 0) return false;
  return alternatives.some((required) =>
    permissionMapSatisfies(granted, required),
  );
}
export const defaultRolePayloads: Record<
  DefaultRoleName,
  Record<string, string[]>
> = {
  viewer: toMutablePayload(viewer.statements),
  member: toMutablePayload(member.statements),
  admin: toMutablePayload(admin.statements),
};
