import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import db, { schema } from "../database";
import { publishEvent } from "../events";

export type WorkspaceRoleChangedAuditPayload = {
  eventType: "workspace.role_changed";
  workspaceId: string;
  actorUserId: string | null;
  targetUserId: string;
  previousRole: string;
  nextRole: string;
  requestId: string;
};

export function workspaceRoleChangedAuditPayload(input: {
  workspaceId: string;
  actorUserId?: string | null;
  targetUserId: string;
  previousRole: string;
  nextRole: string;
  requestId?: string;
}): WorkspaceRoleChangedAuditPayload {
  return {
    eventType: "workspace.role_changed",
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    targetUserId: input.targetUserId,
    previousRole: input.previousRole,
    nextRole: input.nextRole,
    requestId: input.requestId ?? createId(),
  };
}

export async function recordWorkspaceRoleChanged(
  input: Parameters<typeof workspaceRoleChangedAuditPayload>[0],
) {
  const payload = workspaceRoleChangedAuditPayload(input);
  const auditEventId = createId();

  await db.transaction(async (tx) => {
    await tx.insert(schema.authorizationAuditEventTable).values({
      id: auditEventId,
      ...payload,
    });
    await tx
      .delete(schema.sessionTable)
      .where(
        and(
          eq(schema.sessionTable.userId, payload.targetUserId),
          eq(schema.sessionTable.activeOrganizationId, payload.workspaceId),
        ),
      );
  });

  await publishEvent("workspace.role_changed", {
    auditEventId,
    workspaceId: payload.workspaceId,
    targetUserId: payload.targetUserId,
  });

  return { auditEventId, payload };
}
