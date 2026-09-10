import { and, eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";
import {
  getRelayOpsAuthorizationContract,
  RELAYOPS_AUTHORIZATION_REGISTRY,
  type RelayOpsAuthorizationAlternative,
  type RelayOpsAuthorizationOperationId,
} from "./authorization-registry";
import { relayOpsApiKeyAllowsOperation } from "./authorization-scopes";

type ContextResolver = (c: Context) => boolean | Promise<boolean>;

type RelayOpsAuthorizationOptions = {
  ownedResource?: "incident" | "service";
  contextResolver?: ContextResolver;
};

async function getPrimaryOwnerTeamId(
  workspaceId: string,
  resourceId: string,
  resource: "incident" | "service",
) {
  if (resource === "service") {
    const [service] = await db
      .select({ ownerTeamId: schema.serviceTable.ownerTeamId })
      .from(schema.serviceTable)
      .where(
        and(
          eq(schema.serviceTable.workspaceId, workspaceId),
          eq(schema.serviceTable.id, resourceId),
        ),
      )
      .limit(1);
    return service?.ownerTeamId ?? null;
  }

  const [incident] = await db
    .select({ ownerTeamId: schema.serviceTable.ownerTeamId })
    .from(schema.incidentTable)
    .innerJoin(
      schema.serviceTable,
      and(
        eq(schema.incidentTable.serviceId, schema.serviceTable.id),
        eq(schema.incidentTable.workspaceId, schema.serviceTable.workspaceId),
      ),
    )
    .where(
      and(
        eq(schema.incidentTable.workspaceId, workspaceId),
        eq(schema.incidentTable.id, resourceId),
      ),
    )
    .limit(1);
  return incident?.ownerTeamId ?? null;
}

export async function isRelayOpsPrimaryServiceOwner(
  workspaceId: string,
  userId: string,
  resourceId: string,
  resource: "incident" | "service",
) {
  const ownerTeamId = await getPrimaryOwnerTeamId(
    workspaceId,
    resourceId,
    resource,
  );
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

async function allowsAlternative(
  c: Context,
  alternative: RelayOpsAuthorizationAlternative,
  options: RelayOpsAuthorizationOptions,
) {
  if (!(await hasWorkspacePermission(c, alternative.permissions))) {
    return false;
  }
  if (alternative.scope === "workspace") {
    return true;
  }

  const workspaceId = c.get("workspaceId") as string | undefined;
  const userId = c.get("userId") as string | undefined;
  const resourceId = c.req.param("id");
  if (!workspaceId || !userId || !resourceId || !options.ownedResource) {
    return false;
  }
  return isRelayOpsPrimaryServiceOwner(
    workspaceId,
    userId,
    resourceId,
    options.ownedResource,
  );
}

export function requireRelayOpsOperationAuthorization(
  operationId: RelayOpsAuthorizationOperationId,
  options: RelayOpsAuthorizationOptions = {},
) {
  const contract = getRelayOpsAuthorizationContract(operationId);
  if (!contract) {
    throw new Error(`Unknown RelayOps authorization operation: ${operationId}`);
  }

  return async (c: Context, next: Next) => {
    if (!c.get("workspaceId")) {
      throw new HTTPException(500, {
        message: "workspaceId not set in context",
      });
    }

    const apiKey = c.get("apiKey") as
      | { permissions?: Record<string, string[]> | null }
      | undefined;
    if (
      apiKey &&
      !relayOpsApiKeyAllowsOperation(apiKey.permissions, contract)
    ) {
      throw new HTTPException(403, {
        message: "Insufficient or invalid API key scope",
      });
    }

    for (const alternative of contract.alternatives) {
      if (!(await allowsAlternative(c, alternative, options))) continue;

      if (contract.context === "saved_view_owner_or_share") {
        const canShare = await hasWorkspacePermission(c, {
          saved_view: ["share"],
        });
        const contextAllowed = options.contextResolver
          ? await options.contextResolver(c)
          : false;
        if (!canShare && !contextAllowed) continue;
      }
      return next();
    }

    throw new HTTPException(403, {
      message: "Insufficient RelayOps capability",
    });
  };
}

function escapeRouteSegment(segment: string) {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesContractPath(path: string, contractPath: string) {
  const pattern = contractPath
    .split("/")
    .map((segment) =>
      segment.startsWith("{") && segment.endsWith("}")
        ? "[^/]+"
        : escapeRouteSegment(segment),
    )
    .join("/");
  return new RegExp(`^${pattern}$`).test(path);
}

async function isSavedViewOwnerContext(c: Context) {
  const workspaceId = c.get("workspaceId") as string | undefined;
  const userId = c.get("userId") as string | undefined;
  const id = c.req.param("id");
  if (!workspaceId || !userId || !id) return false;
  const [row] = await db
    .select({ id: schema.savedViewTable.id })
    .from(schema.savedViewTable)
    .where(
      and(
        eq(schema.savedViewTable.workspaceId, workspaceId),
        eq(schema.savedViewTable.ownerUserId, userId),
        eq(schema.savedViewTable.id, id),
        eq(schema.savedViewTable.schemaVersion, 1),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export function requireMatchedRelayOpsOperationAuthorization() {
  return async (c: Context, next: Next) => {
    const workspaceIndex = c.req.path.indexOf("/workspaces/");
    const path =
      workspaceIndex >= 0 ? c.req.path.slice(workspaceIndex) : c.req.path;
    const contract = RELAYOPS_AUTHORIZATION_REGISTRY.find(
      (entry) =>
        entry.method === c.req.method.toUpperCase() &&
        matchesContractPath(path, entry.path),
    );
    if (!contract) {
      throw new HTTPException(500, {
        message: "RelayOps route is missing an authorization contract",
      });
    }

    const hasOwnedAlternative = contract.alternatives.some(
      (alternative) => alternative.scope === "primary_service_owned",
    );
    const ownedResource = hasOwnedAlternative
      ? contract.path.includes("/services/")
        ? "service"
        : "incident"
      : undefined;
    return requireRelayOpsOperationAuthorization(contract.operationId, {
      ...(ownedResource ? { ownedResource } : {}),
      ...("context" in contract &&
      contract.context === "saved_view_owner_or_share"
        ? { contextResolver: isSavedViewOwnerContext }
        : {}),
    })(c, next);
  };
}
