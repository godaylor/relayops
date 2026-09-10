import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../openapi";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { requireMatchedRelayOpsOperationAuthorization } from "../authorization-middleware";
import {
  attachSignal,
  createDemoSignal,
  createManualSignal,
  createSignalSource,
  getSignal,
  listSignalSources,
  listSignals,
  rotateSignalSourceSecret,
} from "./controllers";
import { WebhookEncryptionError } from "./crypto";
import {
  attachSignalBody,
  createSignalSourceBody,
  demoSignalBody,
  listSignalsQuery,
  manualSignalBody,
  signalAttachmentConflictSchema,
  signalAttachmentParam,
  signalAttachmentSchema,
  signalCreateResultSchema,
  signalParam,
  signalSchema,
  signalSourceParam,
  signalSourceSchema,
  signalSourceSecretSchema,
  workspaceParam,
} from "./schema";

const workspaceScope = workspaceAccess.fromParam();
const authorizeOperation = requireMatchedRelayOpsOperationAuthorization();
const access = async (c: Context, next: Next) =>
  workspaceScope(c, async () => authorizeOperation(c, next));

const signalRead = requireWorkspacePermission({ signal: ["read"] });
const signalCreate = requireWorkspacePermission({ signal: ["create"] });
const signalIngest = requireWorkspacePermission({ signal: ["ingest"] });
const signalAttach = requireWorkspacePermission({
  signal: ["attach"],
  incident: ["read"],
});

const listSignalsRoute = createRoute({
  method: "get",
  operationId: "listRelayOpsSignals",
  path: "/workspaces/{workspaceId}/signals",
  tags: ["RelayOps Signals"],
  summary: "List normalized signals",
  middleware: [access, signalRead] as const,
  request: { params: workspaceParam, query: listSignalsQuery },
  responses: {
    200: jsonResponse("Workspace signals", z.array(signalSchema)),
    403: errorResponse("Missing signal:read permission"),
  },
});

const createManualSignalRoute = createRoute({
  method: "post",
  operationId: "createRelayOpsManualSignal",
  path: "/workspaces/{workspaceId}/signals",
  tags: ["RelayOps Signals"],
  summary: "Create a normalized manual signal",
  middleware: [access, signalCreate] as const,
  request: {
    params: workspaceParam,
    body: {
      required: true,
      content: { "application/json": { schema: manualSignalBody } },
    },
  },
  responses: {
    201: jsonResponse(
      "Created or deduplicated signal",
      signalCreateResultSchema,
    ),
    403: errorResponse("Missing signal:create permission"),
    404: errorResponse("Service not found"),
  },
});

const demoSignalRoute = createRoute({
  method: "post",
  operationId: "createRelayOpsDemoSignal",
  path: "/workspaces/{workspaceId}/signals/demo",
  tags: ["RelayOps Signals"],
  summary: "Create the deterministic degraded-latency demo signal",
  middleware: [access, signalCreate] as const,
  request: {
    params: workspaceParam,
    body: {
      required: true,
      content: { "application/json": { schema: demoSignalBody } },
    },
  },
  responses: {
    201: jsonResponse(
      "Created or deduplicated demo signal",
      signalCreateResultSchema,
    ),
    403: errorResponse("Missing signal:create permission"),
    404: errorResponse("Service not found"),
  },
});

const getSignalRoute = createRoute({
  method: "get",
  operationId: "getRelayOpsSignal",
  path: "/workspaces/{workspaceId}/signals/{id}",
  tags: ["RelayOps Signals"],
  summary: "Get a normalized signal",
  middleware: [access, signalRead] as const,
  request: { params: signalParam },
  responses: {
    200: jsonResponse("Signal", signalSchema),
    403: errorResponse("Missing signal:read permission"),
    404: errorResponse("Signal not found"),
  },
});

const listSourcesRoute = createRoute({
  method: "get",
  operationId: "listRelayOpsSignalSources",
  path: "/workspaces/{workspaceId}/signal-sources",
  tags: ["RelayOps Signals"],
  summary: "List webhook sources without secrets",
  middleware: [access, signalIngest] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Webhook sources", z.array(signalSourceSchema)),
    403: errorResponse("Missing signal:ingest permission"),
  },
});

const createSourceRoute = createRoute({
  method: "post",
  operationId: "createRelayOpsSignalSource",
  path: "/workspaces/{workspaceId}/signal-sources",
  tags: ["RelayOps Signals"],
  summary: "Create a webhook source and reveal its secret once",
  middleware: [access, signalIngest] as const,
  request: {
    params: workspaceParam,
    body: {
      required: true,
      content: { "application/json": { schema: createSignalSourceBody } },
    },
  },
  responses: {
    201: jsonResponse("Created webhook source", signalSourceSecretSchema),
    403: errorResponse("Missing signal:ingest permission"),
    409: errorResponse("Source name conflicts"),
    503: errorResponse("Webhook encryption is not configured"),
  },
});

const rotateSourceRoute = createRoute({
  method: "post",
  operationId: "rotateRelayOpsSignalSourceSecret",
  path: "/workspaces/{workspaceId}/signal-sources/{sourceId}/rotate-secret",
  tags: ["RelayOps Signals"],
  summary: "Rotate a webhook secret and reveal it once",
  middleware: [access, signalIngest] as const,
  request: { params: signalSourceParam },
  responses: {
    200: jsonResponse("Rotated webhook source", signalSourceSecretSchema),
    403: errorResponse("Missing signal:ingest permission"),
    404: errorResponse("Source not found"),
    503: errorResponse("Webhook encryption is not configured"),
  },
});

const attachSignalRoute = createRoute({
  method: "post",
  operationId: "attachRelayOpsSignal",
  path: "/workspaces/{workspaceId}/incidents/{incidentId}/signals/{signalId}",
  tags: ["RelayOps Signals"],
  summary: "Atomically attach a signal to an incident",
  middleware: [access, signalAttach] as const,
  request: {
    params: signalAttachmentParam,
    body: {
      required: true,
      content: { "application/json": { schema: attachSignalBody } },
    },
  },
  responses: {
    200: jsonResponse("Signal attachment", signalAttachmentSchema),
    403: errorResponse("Missing signal:attach permission"),
    404: errorResponse("Signal or incident not found"),
    409: jsonResponse(
      "Optimistic version conflict",
      signalAttachmentConflictSchema,
    ),
  },
});

function encryptionUnavailable(error: unknown): never {
  if (error instanceof WebhookEncryptionError) {
    throw new HTTPException(503, {
      message: "Webhook encryption is unavailable",
    });
  }
  throw error;
}

const protectedSignalRouter = apiRouter<
  BaseVariables & { workspaceId: string }
>()
  .openapi(listSignalsRoute, async (c) =>
    c.json(await listSignals(c.get("workspaceId"), c.req.valid("query")), 200),
  )
  .openapi(createManualSignalRoute, async (c) =>
    c.json(
      await createManualSignal(c.get("workspaceId"), c.req.valid("json")),
      201,
    ),
  )
  .openapi(demoSignalRoute, async (c) =>
    c.json(
      await createDemoSignal(
        c.get("workspaceId"),
        c.req.valid("json").serviceId,
      ),
      201,
    ),
  )
  .openapi(getSignalRoute, async (c) =>
    c.json(await getSignal(c.get("workspaceId"), c.req.valid("param").id), 200),
  )
  .openapi(listSourcesRoute, async (c) =>
    c.json(await listSignalSources(c.get("workspaceId")), 200),
  )
  .openapi(createSourceRoute, async (c) => {
    try {
      return c.json(
        await createSignalSource(
          c.get("workspaceId"),
          c.req.valid("json").name,
        ),
        201,
      );
    } catch (error) {
      encryptionUnavailable(error);
    }
  })
  .openapi(rotateSourceRoute, async (c) => {
    try {
      return c.json(
        await rotateSignalSourceSecret(
          c.get("workspaceId"),
          c.req.valid("param").sourceId,
        ),
        200,
      );
    } catch (error) {
      encryptionUnavailable(error);
    }
  })
  .openapi(attachSignalRoute, async (c) => {
    const params = c.req.valid("param");
    const input = c.req.valid("json");
    const outcome = await attachSignal({
      workspaceId: c.get("workspaceId"),
      incidentId: params.incidentId,
      signalId: params.signalId,
      actorUserId: c.get("userId"),
      ...input,
    });
    if (outcome.kind === "conflict") {
      return c.json(
        {
          code: "version_conflict" as const,
          currentVersion: outcome.currentVersion,
        },
        409,
      );
    }
    return c.json(outcome, 200);
  });

export default protectedSignalRouter;
