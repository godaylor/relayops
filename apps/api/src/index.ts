import "./instrument";

import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { OpenAPIHono } from "@hono/zod-openapi";
import * as Sentry from "@sentry/node";
import type { Session, User } from "better-auth/types";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { timeout } from "hono/timeout";
import type { WSContext } from "hono/ws";
import activity from "./activity";
import { auth } from "./auth";
import { organizationRoutes } from "./auth-openapi";
import billing from "./billing";
import column from "./column";
import comment from "./comment";
import config from "./config";
import db, { getDatabase, schema } from "./database";
import { prepareDatabaseStartup } from "./database/prepare-database-startup";
import { waitForDatabase } from "./database/wait-for-database";
import discordIntegration from "./discord-integration";
import { eventContext } from "./events";
import externalLink from "./external-link";
import genericWebhookIntegration from "./generic-webhook-integration";
import giteaIntegration, { handleGiteaWebhookRoute } from "./gitea-integration";
import githubIntegration, {
  handleGithubWebhookRoute,
} from "./github-integration";
import getInstanceStatus from "./instance/controllers/get-instance-status";
import invitation from "./invitation";
import label from "./label";
import mcpRoutes, { mcpWellKnownRoutes } from "./mcp";
import { migrateColumns } from "./migrations/column-migration";
import notification from "./notification";
import notificationPreferences from "./notification-preferences";
import oauth from "./oauth";
import { createRoute, jsonResponse, z } from "./openapi";
import { initializePlugins } from "./plugins";
import { migrateGitHubIntegration } from "./plugins/github/migration";
import project from "./project";
import { getPublicProject } from "./project/controllers/get-public-project";
import relayops from "./relayops";
import {
  startRelayOpsOutboxWorker,
  stopRelayOpsOutboxWorker,
} from "./relayops/outbox-worker";
import { relayOpsPresence } from "./relayops/presence";
import { publicSignalWebhookRouter } from "./relayops/signals";
import { initializeScheduler, shutdownScheduler } from "./scheduler";
import search from "./search";
import slackIntegration from "./slack-integration";
import { getPrivateObject } from "./storage/s3";
import task from "./task";
import taskRelation from "./task-relation";
import telegramIntegration from "./telegram-integration";
import timeEntry from "./time-entry";
import user from "./user";
import getAvatar from "./user/controllers/get-avatar";
import { authenticateApiRequest } from "./utils/authenticate-api-request";
import { authorizeAssetAccess } from "./utils/authorize-asset-access";
import { getInvitationDetails } from "./utils/check-registration-allowed";
import { migrateApiKeyReferenceId } from "./utils/migrate-apikey-reference-id";
import { migrateNotificationPreferencesSchema } from "./utils/migrate-notification-preferences-schema";
import {
  migrateNotificationSecrets,
  migrateSignalSourceSecrets,
} from "./utils/migrate-notification-secrets";
import { migrateSessionColumn } from "./utils/migrate-session-column";
import { migrateWorkspaceUserEmail } from "./utils/migrate-workspace-user-email";
import { normalizeApiServerUrl } from "./utils/openapi-spec";
import { safeErrorForLog } from "./utils/redact-sensitive";
import { seedDefaultWorkspaceRoles } from "./utils/seed-default-workspace-roles";
import { validateWorkspaceAccess } from "./utils/validate-workspace-access";
import workflowRule from "./workflow-rule";
import workspace from "./workspace";
import {
  addConnection,
  addUserConnection,
  initializeWebSocketAdapter,
  publishWorkspaceBroadcast,
  removeConnection,
  removeUserConnection,
  shutdownWebSocketAdapter,
} from "./ws";

type ApiKey = {
  id: string;
  userId: string;
  enabled: boolean;
  permissions: Record<string, string[]> | null;
};

type AppVariables = {
  Variables: {
    user: User | null;
    session: Session | null;
    userId: string;
    apiKey?: ApiKey;
  };
};

type ApiVariables = {
  Variables: {
    user: User | null;
    session: Session | null;
    userId: string;
    userEmail: string;
    apiKey?: ApiKey;
  };
};

const SAFE_INLINE_ASSET_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const DEFAULT_HTTP_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const WS_MESSAGE_LIMIT_BYTES = 16 * 1024;
const WS_MESSAGES_PER_MINUTE = 120;
const WS_IDLE_TIMEOUT_MS = 75_000;
const WS_CONNECTIONS_PER_USER = 8;
const WS_CONNECTIONS_PER_INSTANCE = 1_000;
const wsConnectionsByUser = new Map<string, number>();
let wsConnectionCount = 0;

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  maximum: number,
) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function reserveWebSocket(
  userId: string,
  connectionsPerUser: number,
  connectionsPerInstance: number,
) {
  const userCount = wsConnectionsByUser.get(userId) ?? 0;
  if (
    userCount >= connectionsPerUser ||
    wsConnectionCount >= connectionsPerInstance
  ) {
    return false;
  }
  wsConnectionsByUser.set(userId, userCount + 1);
  wsConnectionCount += 1;
  return true;
}

function releaseWebSocket(userId: string) {
  const userCount = wsConnectionsByUser.get(userId) ?? 0;
  if (userCount <= 1) wsConnectionsByUser.delete(userId);
  else wsConnectionsByUser.set(userId, userCount - 1);
  wsConnectionCount = Math.max(0, wsConnectionCount - 1);
}

function createMessageQuota(messagesPerMinute: number) {
  let windowStartedAt = Date.now();
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStartedAt >= 60_000) {
      windowStartedAt = now;
      count = 0;
    }
    count += 1;
    return count <= messagesPerMinute;
  };
}

function buildContentDisposition(filename: string, inline: boolean) {
  const normalized = filename
    .normalize("NFC")
    .replace(/[\r\n"]/g, "")
    .trim();
  const safeFilename = normalized || "file";
  const asciiFallback =
    safeFilename
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/]/g, "-")
      .replace(/[^\x20-\x7E]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "file";
  const encodedFilename = encodeURIComponent(safeFilename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  const disposition = inline ? "inline" : "attachment";
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

export function createApp() {
  const app = new Hono<AppVariables>();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      // expected errors (401/404/...) are not reported; real failures are
      if (err.status >= 500) {
        Sentry.captureException(err);
      }
      return err.getResponse();
    }

    Sentry.captureException(err);
    return c.json({ message: "Internal Server Error" }, 500);
  });
  const nodeWs = createNodeWebSocket({ app });
  const { upgradeWebSocket, injectWebSocket } = nodeWs;
  const wsMessageLimitBytes = boundedInteger(
    process.env.KANEO_WS_MESSAGE_LIMIT_BYTES,
    WS_MESSAGE_LIMIT_BYTES,
    1024 * 1024,
  );
  const wsMessagesPerMinute = boundedInteger(
    process.env.KANEO_WS_MESSAGES_PER_MINUTE,
    WS_MESSAGES_PER_MINUTE,
    10_000,
  );
  const wsIdleTimeoutMs = boundedInteger(
    process.env.KANEO_WS_IDLE_TIMEOUT_MS,
    WS_IDLE_TIMEOUT_MS,
    10 * 60_000,
  );
  const wsConnectionsPerUser = boundedInteger(
    process.env.KANEO_WS_CONNECTIONS_PER_USER,
    WS_CONNECTIONS_PER_USER,
    100,
  );
  const wsConnectionsPerInstance = boundedInteger(
    process.env.KANEO_WS_CONNECTIONS_PER_INSTANCE,
    WS_CONNECTIONS_PER_INSTANCE,
    10_000,
  );
  nodeWs.wss.options.maxPayload = wsMessageLimitBytes;
  const corsOrigins = [process.env.CORS_ORIGINS, process.env.KANEO_CLIENT_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(","))
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production") {
    corsOrigins.push("http://localhost:32000", "http://127.0.0.1:32000");
  }
  const allowedOrigins = new Set(corsOrigins);

  if (allowedOrigins.size === 0) {
    console.warn(
      "[cors] Neither CORS_ORIGINS nor KANEO_CLIENT_URL is set, so cross-origin requests are refused. Same-origin deployments (the bundled image) are unaffected; set KANEO_CLIENT_URL if the web app is served from another origin.",
    );
  }

  app.use(
    "*",
    cors({
      credentials: true,
      origin: (origin) => {
        // Reflecting an arbitrary origin alongside credentials lets any site
        // read authenticated responses, so it stays a development convenience.
        if (!origin) {
          return null;
        }
        return allowedOrigins.has(origin) ? origin : null;
      },
    }),
  );

  app.use("*", async (c, next) => {
    const suppliedRequestId = c.req.header("x-request-id");
    const requestId =
      suppliedRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    c.header("X-Request-Id", requestId);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });

  const maxBodySize = boundedInteger(
    process.env.KANEO_MAX_REQUEST_BODY_BYTES,
    DEFAULT_HTTP_BODY_LIMIT_BYTES,
    50 * 1024 * 1024,
  );
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: maxBodySize,
      onError: (c) => c.json({ message: "Request body too large" }, 413),
    }),
  );
  const requestTimeout = timeout(
    boundedInteger(
      process.env.KANEO_REQUEST_TIMEOUT_MS,
      DEFAULT_HTTP_TIMEOUT_MS,
      120_000,
    ),
  );
  app.use("/api/*", (c, next) =>
    c.req.header("upgrade")?.toLowerCase() === "websocket"
      ? next()
      : requestTimeout(c, next),
  );
  app.use("/api/*", async (c, next) => {
    if (!["POST", "PUT", "PATCH"].includes(c.req.method)) return next();
    const contentLength = Number.parseInt(
      c.req.header("content-length") ?? "0",
      10,
    );
    const hasBody =
      contentLength > 0 ||
      c.req.header("transfer-encoding")?.toLowerCase().includes("chunked");
    const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
    if (
      hasBody &&
      ![
        "application/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
        "text/plain",
        "application/octet-stream",
      ].some((allowed) => contentType.startsWith(allowed))
    ) {
      return c.json({ message: "Unsupported Media Type" }, 415);
    }
    return next();
  });

  // Large boards return multi-MB JSON (board/task list responses embed
  // labels and external links per task); gzip cuts that by 85-95% since
  // JSON with repeated keys compresses extremely well.
  app.use(compress());

  const api = new OpenAPIHono<ApiVariables>();

  api.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getInstanceStatus",
      path: "/instance/status",
      tags: ["Instance"],
      summary: "Get instance status",
      description:
        "Public instance setup status. When hasUsers is false the next signup becomes the instance admin.",
      security: [],
      responses: {
        200: jsonResponse(
          "Instance status",
          z
            .object({ hasUsers: z.boolean(), hasAdmin: z.boolean() })
            .openapi("InstanceStatus"),
        ),
      },
    }),
    async (c) => c.json(await getInstanceStatus(), 200),
  );

  const publicProjectApi = api.get("/public-project/:id", async (c) => {
    const { id } = c.req.param();
    const project = await getPublicProject(id);

    return c.json(project);
  });

  api.post("/github-integration/webhook", handleGithubWebhookRoute);

  api.post(
    "/gitea-integration/webhook/:integrationId",
    handleGiteaWebhookRoute,
  );

  const invitationPublicApi = api.get("/invitation/public/:id", async (c) => {
    const { id } = c.req.param();
    const result = await getInvitationDetails(id);
    return c.json(result);
  });

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getSession",
      path: "/auth/get-session",
      tags: ["Authentication"],
      summary: "Get session",
      description:
        "Get the current authenticated session, or null when the caller is not signed in. Served by Better Auth.",
      security: [],
      responses: {
        200: {
          description: "Current session details, or null when unauthenticated",
        },
      },
    }),
    async (c) => auth.handler(c.req.raw),
  );

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getAsset",
      path: "/asset/{id}",
      tags: ["Assets"],
      summary: "Download asset",
      description:
        "Download an uploaded asset. Readable without signing in only when it belongs to a public project; image types are served inline, everything else as an attachment.",
      security: [],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: "The requested asset binary stream",
          content: { "*/*": { schema: { type: "string", format: "binary" } } },
        },
        304: { description: "Not modified" },
        403: { description: "No access to this asset" },
        404: { description: "Asset not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.param();
      const [asset] = await db
        .select({
          id: schema.assetTable.id,
          objectKey: schema.assetTable.objectKey,
          mimeType: schema.assetTable.mimeType,
          filename: schema.assetTable.filename,
          workspaceId: schema.assetTable.workspaceId,
          isPublic: schema.projectTable.isPublic,
        })
        .from(schema.assetTable)
        .innerJoin(
          schema.projectTable,
          eq(schema.assetTable.projectId, schema.projectTable.id),
        )
        .where(eq(schema.assetTable.id, id))
        .limit(1);

      if (!asset) {
        throw new HTTPException(404, { message: "Asset not found" });
      }

      await authorizeAssetAccess(c, asset);

      try {
        const object = await getPrivateObject(asset.objectKey);
        const storedContentType =
          (object.contentType || asset.mimeType)
            .toLowerCase()
            .split(";")[0]
            ?.trim() ?? "";
        const inline = SAFE_INLINE_ASSET_TYPES.has(storedContentType);

        return new Response(object.body as BodyInit, {
          headers: {
            "Cache-Control": asset.isPublic
              ? "public, max-age=300"
              : "private, max-age=120",
            "Content-Disposition": buildContentDisposition(
              asset.filename,
              inline,
            ),
            "Content-Length": object.contentLength?.toString() || "",
            "Content-Type": inline
              ? storedContentType
              : "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
            ETag: object.etag || "",
            "Last-Modified": object.lastModified?.toUTCString() || "",
          },
        });
      } catch (error) {
        console.error("Failed to stream asset:", safeErrorForLog(error));
        throw new HTTPException(404, { message: "Asset object not found" });
      }
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getUserAvatar",
      path: "/user/avatar/{id}",
      tags: ["User"],
      summary: "Download avatar",
      description:
        "Download a user avatar by its avatar ID. Public, immutable, and cache-friendly: the id changes whenever the avatar is replaced.",
      security: [],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: "The avatar image",
          content: {
            "image/*": { schema: { type: "string", format: "binary" } },
          },
        },
        304: { description: "Not modified" },
        404: { description: "Avatar not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const avatar = await getAvatar(id);

      if (!avatar) {
        throw new HTTPException(404, { message: "Avatar not found" });
      }

      const etag = `"${avatar.id}"`;
      if (c.req.header("If-None-Match") === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag } });
      }

      return new Response(new Uint8Array(avatar.data) as BodyInit, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": avatar.size.toString(),
          "Content-Type": avatar.mimeType,
          "X-Content-Type-Options": "nosniff",
          ETag: etag,
          "Last-Modified": avatar.updatedAt.toUTCString(),
        },
      });
    },
  );

  const configApi = api.route("/config", config);

  api.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "API key or session token (Bearer)",
  });
  organizationRoutes(api.openAPIRegistry);

  api.get("/openapi", (c) => {
    const document = api.getOpenAPI31Document({
      openapi: "3.1.0",
      info: {
        title: "RelayOps API",
        version: "1.0.0",
        description:
          "RelayOps incident operations API — services, signals, incidents, append-only timelines and reliability analytics. Includes retained legacy Kaneo compatibility routes. Independent MIT-licensed derivative of Kaneo; not an official or endorsed Kaneo product.",
      },
      servers: [
        {
          url: normalizeApiServerUrl(process.env.KANEO_API_URL || "/api"),
          description: "RelayOps API server (same origin unless configured)",
        },
      ],
      security: [{ bearerAuth: [] }],
    });

    // Every authenticated route sits behind the same app-wide
    // authenticateApiRequest middleware, so the shared 401 is injected here
    // rather than repeated on all ~120 route definitions. Routes that opt out
    // of auth declare `security: []` and are skipped.
    const httpMethods = [
      "get",
      "post",
      "put",
      "delete",
      "patch",
      "options",
      "head",
      "trace",
    ];
    const paths = (document.paths ?? {}) as Record<
      string,
      Record<
        string,
        { responses?: Record<string, unknown>; security?: unknown[] }
      >
    >;
    for (const operations of Object.values(paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (!httpMethods.includes(method) || !operation.responses) continue;
        if (
          Array.isArray(operation.security) &&
          operation.security.length === 0
        ) {
          continue;
        }
        operation.responses["401"] ??= {
          description: "Missing or invalid credentials",
        };
      }
    }

    return c.json(document);
  });

  // Better Auth serves GET /auth/device as JSON. Browsers that open the API URL
  // directly expect a page, so redirect full document navigations to the web app.
  const authDeviceQuerySchema = z.object({
    user_code: z.string().optional().openapi({
      description: "The device authorization user code.",
    }),
    ui: z.enum(["1"]).optional().openapi({
      description:
        "Force a redirect to the web UI, for clients that do not send Sec-Fetch-* headers.",
    }),
  });

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getDeviceAuthorizationPage",
      path: "/auth/device",
      tags: ["Authentication"],
      summary: "Device authorization page",
      description:
        "Better Auth serves this as JSON. A top-level browser navigation is redirected to the web app's device screen instead, so opening the URL by hand shows a page rather than a JSON blob.",
      security: [],
      request: { query: authDeviceQuerySchema },
      responses: {
        302: {
          description: "Redirects the browser to the web app device screen",
        },
        200: { description: "Device authorization payload from Better Auth" },
      },
    }),
    async (c) => {
      const { user_code: userCode, ui } = c.req.valid("query");
      const secFetchDest = c.req.header("Sec-Fetch-Dest");
      const forceUiRedirect = ui === "1";
      // Top-level browser tab / address bar (not `fetch()` / XHR from the SPA).
      // Optional `ui=1` forces redirect when Sec-Fetch-* headers are missing (e.g. some clients).
      if (forceUiRedirect || secFetchDest === "document") {
        const clientUrl = (
          process.env.KANEO_CLIENT_URL || "http://127.0.0.1:32000"
        ).replace(/\/$/, "");
        const deviceUrl = new URL(`${clientUrl}/device`);
        if (userCode) {
          deviceUrl.searchParams.set("user_code", userCode);
        }
        return c.redirect(deviceUrl.toString(), 302);
      }
      return auth.handler(c.req.raw);
    },
  );

  api.on(["POST", "GET", "PUT", "PATCH", "DELETE"], "/auth/*", async (c) => {
    const authHeader = c.req.header("Authorization");
    const apiKeyHeader = c.req.header("x-api-key");
    const bearerToken = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (bearerToken && !apiKeyHeader) {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      // Preserve Better Auth bearer session tokens on auth routes.
      if (session?.session && session.user) {
        return auth.handler(c.req.raw);
      }

      const headers = new Headers(c.req.raw.headers);

      // Better Auth API key plugin validates from x-api-key by default.
      headers.set("x-api-key", bearerToken);

      return auth.handler(
        new Request(c.req.raw, {
          headers,
        }),
      );
    }

    return auth.handler(c.req.raw);
  });

  api.route("/", mcpRoutes);
  const relayopsWebhookApi = api.route("/webhooks", publicSignalWebhookRouter);

  api.use("*", async (c, next) => {
    const path = c.req.path;
    if (
      path.startsWith("/api/mcp") ||
      path.startsWith("/api/.well-known/") ||
      path === "/api/billing/webhook"
    ) {
      return next();
    }
    return Sentry.withIsolationScope(async () => {
      Sentry.setUser(null);
      try {
        await authenticateApiRequest(c);
        const windowId = c.req.header("X-Kaneo-Window-Id");
        const userId = c.get("userId");
        const initiatorId = windowId ? `${userId}:${windowId}` : userId;
        return await eventContext.run({ initiatorId }, next);
      } catch (error) {
        if (!(error instanceof HTTPException)) {
          console.error("API authentication failed:", safeErrorForLog(error));
          throw new HTTPException(500, { message: "Internal Server Error" });
        }
        throw error;
      } finally {
        Sentry.setUser(null);
      }
    });
  });

  const oauthApi = api.route("/oauth", oauth);

  const billingApi = api.route("/billing", billing);
  const projectApi = api.route("/project", project);
  const relayopsApi = api.route("/relayops", relayops);
  const taskApi = api.route("/task", task);
  const columnApi = api.route("/column", column);
  const activityApi = api.route("/activity", activity);
  const commentApi = api.route("/comment", comment);
  const timeEntryApi = api.route("/time-entry", timeEntry);
  const labelApi = api.route("/label", label);
  const notificationApi = api.route("/notification", notification);
  const notificationPreferencesApi = api.route(
    "/notification-preferences",
    notificationPreferences,
  );
  const searchApi = api.route("/search", search);
  const githubIntegrationApi = api.route(
    "/github-integration",
    githubIntegration,
  );
  const giteaIntegrationApi = api.route("/gitea-integration", giteaIntegration);
  const genericWebhookIntegrationApi = api.route(
    "/generic-webhook-integration",
    genericWebhookIntegration,
  );
  const discordIntegrationApi = api.route(
    "/discord-integration",
    discordIntegration,
  );
  const slackIntegrationApi = api.route("/slack-integration", slackIntegration);
  const telegramIntegrationApi = api.route(
    "/telegram-integration",
    telegramIntegration,
  );
  const taskRelationApi = api.route("/task-relation", taskRelation);
  const externalLinkApi = api.route("/external-link", externalLink);
  const workflowRuleApi = api.route("/workflow-rule", workflowRule);
  const invitationApi = api.route("/invitation", invitation);
  const workspaceApi = api.route("/workspace", workspace);
  const userApi = api.route("/user", user);

  app.route(
    "/",
    mcpWellKnownRoutes(
      (process.env.KANEO_API_URL || "http://127.0.0.1:32001").replace(
        /\/api\/?$/,
        "",
      ),
    ),
  );

  // User-scoped WebSocket endpoint; MUST be registered before /ws/:projectId
  // so the literal path "user" isn't consumed by the param route.
  api.get(
    "/ws/user",
    upgradeWebSocket(async (c) => {
      const origin = c.req.header("origin");
      if (!origin || !allowedOrigins.has(origin)) {
        throw new HTTPException(403, { message: "Untrusted WebSocket origin" });
      }
      try {
        await authenticateApiRequest(c);
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        console.error("API authentication failed:", safeErrorForLog(error));
        throw new HTTPException(500, { message: "Internal Server Error" });
      }

      const userId = c.get("userId");
      let conn: ReturnType<typeof addUserConnection> | null = null;
      const memberships = await db
        .select({ workspaceId: schema.workspaceUserTable.workspaceId })
        .from(schema.workspaceUserTable)
        .where(eq(schema.workspaceUserTable.userId, userId));
      const workspaceIds = memberships.map((row) => row.workspaceId);
      const displayName =
        c.get("user")?.name ?? c.get("userEmail") ?? "RelayOps user";
      const authorizedPresenceIncidents = new Set<string>();
      const consumeMessage = createMessageQuota(wsMessagesPerMinute);
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let reserved = false;
      const resetIdle = (ws: WSContext) => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () => ws.close(1001, "Idle timeout"),
          wsIdleTimeoutMs,
        );
      };

      return {
        onOpen(_evt, ws) {
          reserved =
            Boolean(userId) &&
            reserveWebSocket(
              userId,
              wsConnectionsPerUser,
              wsConnectionsPerInstance,
            );
          if (!reserved) {
            ws.close(1013, "Connection limit exceeded");
            return;
          }
          resetIdle(ws);
          if (userId) {
            conn = addUserConnection(userId, ws, workspaceIds);
          }
        },
        async onMessage(evt, ws) {
          try {
            resetIdle(ws);
            if (!consumeMessage()) {
              ws.close(1008, "Message rate limit exceeded");
              return;
            }
            const data = evt.data;
            let raw: string | null = null;
            if (typeof data === "string") {
              raw = data;
            } else if (Buffer.isBuffer(data)) {
              raw = data.toString();
            } else if (data instanceof ArrayBuffer) {
              raw = Buffer.from(data).toString();
            } else if (ArrayBuffer.isView(data)) {
              raw = Buffer.from(
                new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
              ).toString();
            } else if (data instanceof Blob) {
              raw = await data.text();
            }
            if (!raw) return;
            if (Buffer.byteLength(raw) > wsMessageLimitBytes) {
              ws.close(1009, "Message too large");
              return;
            }
            const msg = JSON.parse(raw) as {
              v?: number;
              type?: string;
              workspaceId?: string;
              incidentId?: string;
              action?: string;
            };
            if (msg.type === "ping") return;
            if (
              !conn ||
              msg.v !== 1 ||
              msg.type !== "RELAYOPS_PRESENCE" ||
              (msg.action !== "heartbeat" && msg.action !== "leave") ||
              typeof msg.workspaceId !== "string" ||
              typeof msg.incidentId !== "string" ||
              !conn.workspaceIds.has(msg.workspaceId)
            ) {
              return;
            }

            if (msg.action === "leave") {
              const leave = relayOpsPresence.leave(conn.id);
              if (leave) {
                await publishWorkspaceBroadcast(leave.workspaceId, leave);
              }
              return;
            }

            const scopeKey = `${msg.workspaceId}:${msg.incidentId}`;
            if (!authorizedPresenceIncidents.has(scopeKey)) {
              const [incident] = await db
                .select({ id: schema.incidentTable.id })
                .from(schema.incidentTable)
                .where(
                  and(
                    eq(schema.incidentTable.workspaceId, msg.workspaceId),
                    eq(schema.incidentTable.id, msg.incidentId),
                  ),
                )
                .limit(1);
              if (!incident) return;
              authorizedPresenceIncidents.add(scopeKey);
            }
            const heartbeat = relayOpsPresence.heartbeat({
              connectionId: conn.id,
              workspaceId: msg.workspaceId,
              incidentId: msg.incidentId,
              userId,
              displayName,
            });
            await publishWorkspaceBroadcast(msg.workspaceId, heartbeat);
          } catch {
            // Presence is best-effort and never participates in authorization.
          }
        },
        onClose() {
          if (idleTimer) clearTimeout(idleTimer);
          if (reserved) releaseWebSocket(userId);
          if (conn && userId) {
            const leave = relayOpsPresence.leave(conn.id);
            if (leave) {
              void publishWorkspaceBroadcast(leave.workspaceId, leave);
            }
            removeUserConnection(userId, conn);
          }
        },
      };
    }),
  );

  api.get(
    "/ws/:projectId",
    upgradeWebSocket(async (c) => {
      const origin = c.req.header("origin");
      if (!origin || !allowedOrigins.has(origin)) {
        throw new HTTPException(403, { message: "Untrusted WebSocket origin" });
      }
      const projectId = c.req.param("projectId");

      try {
        await authenticateApiRequest(c);
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        console.error("API authentication failed:", safeErrorForLog(error));
        throw new HTTPException(500, { message: "Internal Server Error" });
      }

      const userId = c.get("userId");

      if (projectId) {
        const [project] = await db
          .select({ workspaceId: schema.projectTable.workspaceId })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.id, projectId))
          .limit(1);

        if (!project) {
          throw new HTTPException(401, { message: "Unauthorized" });
        }

        await validateWorkspaceAccess(userId, project.workspaceId);
      }

      const windowId = c.req.query("windowId");
      const initiatorId = windowId ? `${userId}:${windowId}` : userId;
      let conn: ReturnType<typeof addConnection> | null = null;
      const consumeMessage = createMessageQuota(wsMessagesPerMinute);
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let reserved = false;
      const resetIdle = (ws: WSContext) => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () => ws.close(1001, "Idle timeout"),
          wsIdleTimeoutMs,
        );
      };

      return {
        onOpen(_evt, ws) {
          reserved = reserveWebSocket(
            userId,
            wsConnectionsPerUser,
            wsConnectionsPerInstance,
          );
          if (!reserved) {
            ws.close(1013, "Connection limit exceeded");
            return;
          }
          resetIdle(ws);
          if (projectId) {
            conn = addConnection(projectId, ws, userId, initiatorId);
          }
        },
        onMessage(evt, ws) {
          // Respond to client keepalive pings (sent every 30s to prevent
          // Cloudflare from closing idle connections at 100s timeout)
          try {
            resetIdle(ws);
            if (!consumeMessage()) {
              ws.close(1008, "Message rate limit exceeded");
              return;
            }
            const raw =
              typeof evt.data === "string"
                ? evt.data
                : Buffer.isBuffer(evt.data)
                  ? evt.data.toString()
                  : null;
            if (raw && Buffer.byteLength(raw) > wsMessageLimitBytes) {
              ws.close(1009, "Message too large");
              return;
            }
            if (raw) {
              const msg = JSON.parse(raw) as { type?: string };
              if (msg?.type === "ping") {
                // No-op: receiving the ping is enough to satisfy Cloudflare.
                // A pong response is optional but helps confirm liveness.
              }
            }
          } catch {
            // Ignore malformed messages
          }
        },
        onClose() {
          if (idleTimer) clearTimeout(idleTimer);
          if (reserved) releaseWebSocket(userId);
          if (conn && projectId) {
            removeConnection(projectId, conn);
          }
        },
      };
    }),
  );

  app.route("/api", api);

  return {
    app,
    api,
    injectWebSocket,
    activityApi,
    billingApi,
    columnApi,
    commentApi,
    configApi,
    discordIntegrationApi,
    externalLinkApi,
    genericWebhookIntegrationApi,
    githubIntegrationApi,
    giteaIntegrationApi,
    invitationApi,
    invitationPublicApi,
    labelApi,
    notificationApi,
    notificationPreferencesApi,
    projectApi,
    relayopsApi,
    relayopsWebhookApi,
    publicProjectApi,
    searchApi,
    slackIntegrationApi,
    taskApi,
    taskRelationApi,
    telegramIntegrationApi,
    timeEntryApi,
    userApi,
    workflowRuleApi,
    workspaceApi,
    oauthApi,
  };
}

export async function runStartupTasks() {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  await prepareDatabaseStartup({
    waitForDatabase: async () => {
      await waitForDatabase({
        query: async () => {
          await getDatabase().execute(sql`SELECT 1`);
        },
      });
    },
    runStartupMigrations: async () => {
      await migrateWorkspaceUserEmail();
      await migrateSessionColumn();

      console.log("🔄 Migrating database...");
      await migrate(getDatabase(), {
        migrationsFolder: `${currentDir}/../drizzle`,
      });
      console.log("✅ Database migrated successfully!");
    },
  });

  // After Drizzle migrations: apikey table must exist so we can align columns
  // with Better Auth (reference_id + nullable user_id).
  await migrateApiKeyReferenceId();

  await migrateNotificationPreferencesSchema();
  await migrateNotificationSecrets();
  await migrateSignalSourceSecrets();
  await migrateGitHubIntegration();
  await migrateColumns();
  await seedDefaultWorkspaceRoles();

  initializePlugins();
  initializeScheduler();
  await initializeWebSocketAdapter();
  startRelayOpsOutboxWorker();
}

export async function startServer(
  injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"],
  port = Number(process.env.PORT ?? 32001),
) {
  try {
    await runStartupTasks();
  } catch (error) {
    console.error("❌ Database migration failed!", safeErrorForLog(error));
    process.exit(1);
  }

  let shuttingDown = false;

  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname: process.env.HOST ?? "127.0.0.1",
    },
    () => {
      console.log(
        `⚡ API is running at ${process.env.KANEO_API_URL || "http://127.0.0.1:32001"}`,
      );
    },
  );

  configureServerTimeouts(server);

  injectWebSocket(server);

  const gracefulShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("🛑 Shutting down gracefully...");
    shutdownScheduler();
    stopRelayOpsOutboxWorker();
    await shutdownWebSocketAdapter();
    server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void gracefulShutdown();
  });

  process.on("SIGINT", () => {
    void gracefulShutdown();
  });
}

export function configureServerTimeouts(server: object) {
  const requestTimeout = boundedInteger(
    process.env.KANEO_REQUEST_TIMEOUT_MS,
    DEFAULT_HTTP_TIMEOUT_MS,
    120_000,
  );
  if ("requestTimeout" in server) {
    (server as { requestTimeout: number }).requestTimeout = requestTimeout;
  }
  if ("headersTimeout" in server) {
    (server as { headersTimeout: number }).headersTimeout = Math.min(
      requestTimeout,
      15_000,
    );
  }
  if ("keepAliveTimeout" in server) {
    (server as { keepAliveTimeout: number }).keepAliveTimeout = 5_000;
  }
  if ("setTimeout" in server && typeof server.setTimeout === "function") {
    (
      server as {
        setTimeout: (
          timeoutMs: number,
          callback: (socket: { end: (payload: string) => void }) => void,
        ) => unknown;
      }
    ).setTimeout(requestTimeout, (socket) => {
      socket.end(
        "HTTP/1.1 408 Request Timeout\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
    });
  }
}

const createdApp = createApp();
const {
  app,
  injectWebSocket,
  activityApi,
  billingApi,
  columnApi,
  commentApi,
  configApi,
  discordIntegrationApi,
  externalLinkApi,
  genericWebhookIntegrationApi,
  githubIntegrationApi,
  giteaIntegrationApi,
  invitationApi,
  invitationPublicApi,
  labelApi,
  notificationApi,
  notificationPreferencesApi,
  projectApi,
  relayopsApi,
  relayopsWebhookApi,
  publicProjectApi,
  searchApi,
  slackIntegrationApi,
  taskApi,
  taskRelationApi,
  telegramIntegrationApi,
  timeEntryApi,
  userApi,
  workflowRuleApi,
  workspaceApi,
  oauthApi,
} = createdApp;

const entrypoint = process.argv[1];
const isMainModule =
  entrypoint !== undefined &&
  entrypoint !== "" &&
  import.meta.url === pathToFileURL(entrypoint).href;

if (isMainModule) {
  void startServer(injectWebSocket);
}

export type AppType =
  | typeof billingApi
  | typeof configApi
  | typeof projectApi
  | typeof relayopsApi
  | typeof relayopsWebhookApi
  | typeof taskApi
  | typeof columnApi
  | typeof activityApi
  | typeof commentApi
  | typeof timeEntryApi
  | typeof labelApi
  | typeof notificationApi
  | typeof notificationPreferencesApi
  | typeof searchApi
  | typeof githubIntegrationApi
  | typeof giteaIntegrationApi
  | typeof genericWebhookIntegrationApi
  | typeof discordIntegrationApi
  | typeof slackIntegrationApi
  | typeof telegramIntegrationApi
  | typeof taskRelationApi
  | typeof externalLinkApi
  | typeof workflowRuleApi
  | typeof invitationApi
  | typeof workspaceApi
  | typeof userApi
  | typeof publicProjectApi
  | typeof invitationPublicApi
  | typeof oauthApi;

export default app;
