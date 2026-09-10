import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";
import type { IncidentSeverity } from "./lifecycle";

export type IncidentPolicyAction =
  | "update"
  | "transition"
  | "assign"
  | "severity"
  | "resolve"
  | "reopen"
  | "dismiss";

type IncidentPolicyInput = {
  action: IncidentPolicyAction;
  ownerTeamId: string | null;
  currentSeverity: IncidentSeverity;
  targetSeverity?: IncidentSeverity;
};

async function isPrimaryServiceOwner(
  workspaceId: string,
  userId: string,
  ownerTeamId: string | null,
) {
  if (!ownerTeamId) return false;
  const [membership] = await db
    .select({ id: schema.teamMemberTable.id })
    .from(schema.teamMemberTable)
    .innerJoin(
      schema.teamTable,
      and(
        eq(schema.teamMemberTable.teamId, schema.teamTable.id),
        eq(schema.teamTable.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(schema.teamTable.id, ownerTeamId),
        eq(schema.teamMemberTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

function ownedSeverityPolicyAllows(input: IncidentPolicyInput) {
  if (input.action === "severity") {
    return input.currentSeverity !== "sev1" && input.targetSeverity !== "sev1";
  }
  if (
    input.action === "resolve" ||
    input.action === "reopen" ||
    input.action === "dismiss"
  ) {
    return input.currentSeverity !== "sev1";
  }
  return true;
}

export async function requireIncidentPolicy(
  c: Context,
  input: IncidentPolicyInput,
) {
  if (
    await hasWorkspacePermission(c, {
      incident: [input.action],
    })
  ) {
    return;
  }

  const ownedAction = `${input.action}_owned` as
    | "update_owned"
    | "transition_owned"
    | "assign_owned"
    | "severity_owned"
    | "resolve_owned"
    | "reopen_owned"
    | "dismiss_owned";
  if (
    ownedSeverityPolicyAllows(input) &&
    (await hasWorkspacePermission(c, { incident: [ownedAction] })) &&
    (await isPrimaryServiceOwner(
      c.get("workspaceId"),
      c.get("userId"),
      input.ownerTeamId,
    ))
  ) {
    return;
  }

  throw new HTTPException(403, {
    message: "Insufficient incident capability",
  });
}

export async function requireTimelineCapability(
  c: Context,
  action: "publish" | "correct",
) {
  if (
    !(await hasWorkspacePermission(c, {
      incident_timeline: [action],
    }))
  ) {
    throw new HTTPException(403, {
      message: "Insufficient incident timeline capability",
    });
  }
}
