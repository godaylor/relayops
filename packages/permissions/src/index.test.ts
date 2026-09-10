import { describe, expect, it } from "vitest";
import {
  ac,
  admin,
  builtInRoles,
  DEFAULT_ROLE_NAMES,
  defaultRolePayloads,
  incidentCommander,
  isPreS7GeneratedViewerPayload,
  member,
  normalizePermissionMap,
  owner,
  PRE_S7_GENERATED_VIEWER_PAYLOAD,
  permissionMapSatisfies,
  RELAYOPS_ROLE_TEMPLATE_NAMES,
  relayOpsRoleTemplatePayloads,
  relayOpsRoleTemplates,
  responder,
  serviceOwner,
  statement,
  viewer,
  workspaceAdmin,
} from "./index";

describe("@kaneo/permissions statement surface", () => {
  it("exposes Kaneo's resource statements alongside better-auth defaults", () => {
    expect(statement.project).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "share",
    ]);
    expect(statement.task).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "assign",
    ]);
    expect(statement.label).toEqual(["create", "read", "update", "delete"]);
    expect(statement.service).toEqual([
      "create",
      "read",
      "update",
      "update_owned",
      "archive",
      "archive_owned",
    ]);
    expect(statement.incident).toEqual([
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
    ]);
    expect(statement.incident_timeline).toEqual(["read", "publish", "correct"]);
    expect(statement.signal).toEqual(["create", "read", "ingest", "attach"]);
    expect(statement.saved_view).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "share",
    ]);
    expect(statement.analytics).toEqual(["read", "export"]);
    expect(statement.workspace).toEqual([
      "read",
      "update",
      "delete",
      "manage_settings",
    ]);
    // The organization plugin's defaults must still be present so we can
    // reuse them in member/admin/owner roles without breaking better-auth
    // checks like organization:update.
    expect(statement.organization).toBeDefined();
    expect(statement.member).toBeDefined();
  });

  it("returns the same `ac` instance for downstream consumers", () => {
    expect(ac).toBeDefined();
    expect(typeof ac.newRole).toBe("function");
  });
});

describe("built-in role privileges", () => {
  it("viewer can read but cannot create or modify", () => {
    expect(viewer.statements.project).toEqual(["read"]);
    expect(viewer.statements.task).toEqual(["read"]);
    expect(viewer.statements.label).toEqual(["read"]);
    expect(viewer.statements.workspace).toEqual(["read"]);
    expect(viewer.statements.service).toEqual(["read"]);
    expect(viewer.statements.incident).toEqual(["read"]);
  });

  it("member can create/read/update tasks but not delete or manage settings", () => {
    expect(member.statements.task).toContain("create");
    expect(member.statements.task).toContain("update");
    expect(member.statements.task).not.toContain("delete");
    expect(member.statements.project).toContain("create");
    expect(member.statements.project).not.toContain("delete");
    expect(member.statements.workspace).toEqual(["read"]);
    expect(member.statements.service).toEqual(["read"]);
    expect(member.statements.incident).toEqual(["read"]);
  });

  it("admin can delete tasks and manage workspace settings but cannot delete the workspace", () => {
    expect(admin.statements.task).toContain("delete");
    expect(admin.statements.task).toContain("assign");
    expect(admin.statements.project).toContain("delete");
    expect(admin.statements.project).toContain("share");
    expect(admin.statements.workspace).toContain("manage_settings");
    expect(admin.statements.workspace).not.toContain("delete");
    expect(admin.statements.service).toEqual(["create", "read"]);
    expect(admin.statements.incident).toEqual(["create", "read"]);
  });

  it("owner has every Kaneo resource action including workspace:delete", () => {
    expect(owner.statements.service).toEqual([...statement.service]);
    expect(owner.statements.incident).toEqual([...statement.incident]);
    expect(owner.statements.incident_timeline).toEqual([
      ...statement.incident_timeline,
    ]);
    expect(owner.statements.signal).toEqual([...statement.signal]);
    expect(owner.statements.saved_view).toEqual([...statement.saved_view]);
    expect(owner.statements.analytics).toEqual([...statement.analytics]);
    expect(owner.statements.task).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete", "assign"]),
    );
    expect(owner.statements.project).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete", "share"]),
    );
    expect(owner.statements.workspace).toEqual(
      expect.arrayContaining(["read", "update", "delete", "manage_settings"]),
    );
  });

  it("groups all four roles under builtInRoles by name", () => {
    expect(Object.keys(builtInRoles).sort()).toEqual([
      "admin",
      "member",
      "owner",
      "viewer",
    ]);
    expect(builtInRoles.viewer).toBe(viewer);
    expect(builtInRoles.member).toBe(member);
    expect(builtInRoles.admin).toBe(admin);
    expect(builtInRoles.owner).toBe(owner);
  });
});

describe("RelayOps editable role templates", () => {
  it("exports the five approved template names without reusing legacy member/admin names", () => {
    expect(RELAYOPS_ROLE_TEMPLATE_NAMES).toEqual([
      "viewer",
      "responder",
      "incident_commander",
      "service_owner",
      "workspace_admin",
    ]);
    expect(Object.keys(relayOpsRoleTemplates)).toEqual([
      "viewer",
      "responder",
      "incident_commander",
      "service_owner",
      "workspace_admin",
    ]);
  });

  it("keeps Viewer read-only across every RelayOps resource", () => {
    expect(viewer.statements.service).toEqual(["read"]);
    expect(viewer.statements.incident).toEqual(["read"]);
    expect(viewer.statements.incident_timeline).toEqual(["read"]);
    expect(viewer.statements.signal).toEqual(["read"]);
    expect(viewer.statements.saved_view).toEqual(["read"]);
    expect(viewer.statements.analytics).toEqual(["read"]);
  });

  it("gives Responder only non-terminal workspace incident operations", () => {
    expect(responder.statements.incident).toEqual([
      "create",
      "read",
      "update",
      "transition",
    ]);
    expect(responder.statements.incident_timeline).toEqual(["read", "publish"]);
    expect(responder.statements.incident).not.toContain("assign");
    expect(responder.statements.incident).not.toContain("resolve");
  });

  it("gives Incident Commander workspace-wide lifecycle and correction rights", () => {
    expect(incidentCommander.statements.incident).toEqual(
      expect.arrayContaining([
        "assign",
        "severity",
        "resolve",
        "reopen",
        "dismiss",
      ]),
    );
    expect(incidentCommander.statements.incident_timeline).toContain("correct");
    expect(incidentCommander.statements.analytics).toContain("export");
  });

  it("gives Service Owner only explicit owned mutations", () => {
    expect(serviceOwner.statements.service).toEqual([
      "read",
      "update_owned",
      "archive_owned",
    ]);
    expect(serviceOwner.statements.incident).toContain("transition_owned");
    expect(serviceOwner.statements.incident).toContain("severity_owned");
    expect(serviceOwner.statements.incident).not.toContain("transition");
    expect(serviceOwner.statements.incident).not.toContain("severity");
    expect(serviceOwner.statements.incident_timeline).not.toContain("correct");
  });

  it("gives Workspace Admin all direct RelayOps actions but not workspace deletion", () => {
    expect(workspaceAdmin.statements.service).toEqual([
      "create",
      "read",
      "update",
      "archive",
    ]);
    expect(workspaceAdmin.statements.signal).toContain("ingest");
    expect(workspaceAdmin.statements.saved_view).toContain("share");
    expect(workspaceAdmin.statements.workspace).not.toContain("delete");
  });

  it("does not silently elevate legacy member/admin templates", () => {
    expect(member.statements.incident).toEqual(["read"]);
    expect(admin.statements.incident).toEqual(["create", "read"]);
    expect(member.statements.incident).not.toContain("transition");
    expect(admin.statements.incident).not.toContain("resolve");
  });
});

describe("default-role seed payloads", () => {
  it("names the seedable defaults but excludes owner (kept as static role)", () => {
    expect(DEFAULT_ROLE_NAMES).toEqual(["viewer", "member", "admin"]);
    expect(DEFAULT_ROLE_NAMES).not.toContain("owner");
    expect(Object.keys(defaultRolePayloads).sort()).toEqual([
      "admin",
      "member",
      "viewer",
    ]);
  });

  it("emits JSON-serializable payloads that mirror each role's compiled statements", () => {
    for (const name of DEFAULT_ROLE_NAMES) {
      const role = builtInRoles[name];
      const payload = defaultRolePayloads[name];

      // Every resource the compiled role declares must appear in the payload
      // with the same set of actions (order-insensitive). Otherwise a seeded
      // workspace_role row would silently drift from the static role.
      for (const [resource, actions] of Object.entries(role.statements)) {
        expect(payload[resource]).toBeDefined();
        expect([...payload[resource]].sort()).toEqual([...actions].sort());
      }

      // Round-trips through JSON without loss; the API stores these as text.
      const roundTripped = JSON.parse(JSON.stringify(payload));
      expect(roundTripped).toEqual(payload);
    }
  });

  it("returns a fresh mutable array per resource so callers can edit safely", () => {
    const memberPayload = defaultRolePayloads.member;
    memberPayload.task.push("__test_marker");
    // Re-import-equivalent check: the in-memory payload is mutable but the
    // role object's statements are decoupled (we only mutated the copy).
    expect(memberPayload.task).toContain("__test_marker");
    expect(member.statements.task).not.toContain("__test_marker");
  });
});

describe("RelayOps role seed payloads", () => {
  it("mirrors every compiled template as JSON-safe editable payload", () => {
    for (const name of RELAYOPS_ROLE_TEMPLATE_NAMES) {
      const role = relayOpsRoleTemplates[name];
      const payload = relayOpsRoleTemplatePayloads[name];
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);

      for (const [resource, actions] of Object.entries(role.statements)) {
        expect(payload[resource]).toEqual(actions);
      }
    }
  });

  it("identifies only the exact generated pre-S7 Viewer payload", () => {
    expect(isPreS7GeneratedViewerPayload(PRE_S7_GENERATED_VIEWER_PAYLOAD)).toBe(
      true,
    );
    expect(
      isPreS7GeneratedViewerPayload(
        JSON.stringify(PRE_S7_GENERATED_VIEWER_PAYLOAD),
      ),
    ).toBe(true);
    expect(
      isPreS7GeneratedViewerPayload({
        ...PRE_S7_GENERATED_VIEWER_PAYLOAD,
        analytics: ["read"],
      }),
    ).toBe(false);
    expect(
      isPreS7GeneratedViewerPayload({
        ...PRE_S7_GENERATED_VIEWER_PAYLOAD,
        project: [],
      }),
    ).toBe(false);
  });
});

describe("fail-closed permission maps", () => {
  it("normalizes known resources/actions and removes duplicates", () => {
    expect(
      normalizePermissionMap({
        incident: ["read", "read", "transition"],
        analytics: ["read"],
      }),
    ).toEqual({
      incident: ["read", "transition"],
      analytics: ["read"],
    });
  });

  it.each([
    null,
    [],
    "incident:read",
    { incident: "read" },
    { incident: ["unknown"] },
    { unknown_resource: ["read"] },
  ])("rejects malformed or unknown scope payload %#", (value) => {
    expect(normalizePermissionMap(value)).toBeNull();
  });

  it("requires every action in a multi-resource requirement", () => {
    const granted = {
      project: ["read"],
      analytics: ["read", "export"],
    };
    expect(
      permissionMapSatisfies(granted, {
        project: ["read"],
        analytics: ["export"],
      }),
    ).toBe(true);
    expect(
      permissionMapSatisfies(
        { project: ["read"], analytics: ["read"] },
        { project: ["read"], analytics: ["export"] },
      ),
    ).toBe(false);
  });

  it("treats omitted API-key permissions as no scope rather than unrestricted", () => {
    expect(
      permissionMapSatisfies(null, {
        incident: ["read"],
      }),
    ).toBe(false);
  });
});
