import type { Context, Next } from "hono";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  exportReliabilityAnalytics,
  getReliabilityAnalytics,
} from "./analytics-controllers";
import { reliabilityAnalyticsResponseSchema } from "./analytics-response";
import { reliabilityAnalyticsQuery } from "./analytics-schema";
import { requireMatchedRelayOpsOperationAuthorization } from "./authorization-middleware";

const workspaceParam = z.object({ workspaceId: z.string().min(1) });
const workspaceScope = workspaceAccess.fromParam();
const authorizeOperation = requireMatchedRelayOpsOperationAuthorization();
const access = async (c: Context, next: Next) =>
  workspaceScope(c, async () => authorizeOperation(c, next));

const readRoute = createRoute({
  method: "get",
  operationId: "getRelayOpsReliabilityAnalytics",
  path: "/workspaces/{workspaceId}/analytics/reliability",
  tags: ["RelayOps Analytics"],
  summary: "Get deterministic reliability aggregates and comparison",
  middleware: [
    access,
    requireWorkspacePermission({ analytics: ["read"] }),
  ] as const,
  request: { params: workspaceParam, query: reliabilityAnalyticsQuery },
  responses: {
    200: jsonResponse(
      "Reliability analytics",
      reliabilityAnalyticsResponseSchema,
    ),
    400: errorResponse("Invalid analytics filters or timezone"),
    403: errorResponse("Missing analytics:read permission"),
  },
});

const exportRoute = createRoute({
  method: "get",
  operationId: "exportRelayOpsReliabilityAnalytics",
  path: "/workspaces/{workspaceId}/analytics/reliability.csv",
  tags: ["RelayOps Analytics"],
  summary: "Export the authorized reliability filter set as CSV",
  middleware: [
    access,
    requireWorkspacePermission({ analytics: ["export"] }),
  ] as const,
  request: { params: workspaceParam, query: reliabilityAnalyticsQuery },
  responses: {
    200: {
      description: "Reliability incident export",
      content: { "text/csv": { schema: z.string() } },
    },
    400: errorResponse("Invalid analytics filters or timezone"),
    403: errorResponse("Missing analytics:export permission"),
  },
});

const analyticsRouter = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(readRoute, async (c) =>
    c.json(
      await getReliabilityAnalytics(c.get("workspaceId"), c.req.valid("query")),
      200,
    ),
  )
  .openapi(exportRoute, async (c) => {
    const result = await exportReliabilityAnalytics(
      c.get("workspaceId"),
      c.req.valid("query"),
    );
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    return c.text(result.csv, 200);
  });

export default analyticsRouter;
