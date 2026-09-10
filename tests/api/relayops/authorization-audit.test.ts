import { describe, expect, it } from "vitest";
import { workspaceRoleChangedAuditPayload } from "../../../apps/api/src/relayops/authorization-audit";

describe("RelayOps authorization audit redaction", () => {
  it("whitelists durable role-change fields and drops secrets or permission payloads", () => {
    const payload = workspaceRoleChangedAuditPayload({
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetUserId: "target-1",
      previousRole: "viewer",
      nextRole: "responder",
      requestId: "request-1",
      email: "private@example.com",
      token: "secret-token",
      permissions: { workspace: ["delete"] },
    } as Parameters<typeof workspaceRoleChangedAuditPayload>[0] &
      Record<string, unknown>);

    expect(payload).toEqual({
      eventType: "workspace.role_changed",
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetUserId: "target-1",
      previousRole: "viewer",
      nextRole: "responder",
      requestId: "request-1",
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /email|permission|token|secret/i,
    );
  });
});
