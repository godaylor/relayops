import type { Context, Next } from "hono";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import analyticsRouter from "./analytics-router";
import { requireMatchedRelayOpsOperationAuthorization } from "./authorization-middleware";
import { createIncident, getIncidentDetail } from "./controllers";
import {
  assignIncidentParticipants,
  changeIncidentSeverity,
  correctIncidentTimestamps,
  listIncidentTimeline,
  publishIncidentUpdate,
  transitionIncident,
} from "./incident-commands";
import {
  demoCleanupSchema,
  incidentDetailSchema,
  incidentTimelinePageSchema,
  incidentVersionConflictSchema,
  legacyArchiveSchema,
  legacyExportSchema,
  overviewSchema,
  relayOpsTeamSchema,
  relayOpsWorkspaceSchema,
  serviceListSchema,
  serviceSchema,
} from "./response";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
} from "./saved-view-controllers";
import {
  assignIncidentParticipantsBody,
  changeIncidentSeverityBody,
  correctIncidentTimestampsBody,
  createDemoDataBody,
  createIncidentBody,
  createServiceBody,
  incidentTimelineQuery,
  listServicesQuery,
  publishIncidentUpdateBody,
  transitionIncidentBody,
  updateServiceBody,
  workspaceParam,
  workspaceResourceParam,
} from "./schema";
import {
  archiveService,
  createService,
  getService,
  listServices,
  listTeams,
  unarchiveService,
  updateService,
} from "./service-controllers";
import { protectedSignalRouter } from "./signals";
import { listIncidentWorkbench } from "./workbench-controllers";
import {
  incidentWorkbenchPageSchema,
  savedViewDeleteSchema,
  savedViewListSchema,
  savedViewSchema,
  savedViewVersionConflictSchema,
} from "./workbench-response";
import {
  createSavedViewBody,
  deleteSavedViewQuery,
  incidentWorkbenchQuery,
  updateSavedViewBody,
} from "./workbench-schema";
import {
  activateRelayOps,
  createDemoIncident,
  exportLegacyData,
  getLegacyArchive,
  getOverview,
  getWorkspaceState,
  removeDemoData,
} from "./workspace-controllers";

const workspaceScope = workspaceAccess.fromParam();
const authorizeOperation = requireMatchedRelayOpsOperationAuthorization();
const access = async (c: Context, next: Next) =>
  workspaceScope(c, async () => {
    await authorizeOperation(c, next);
  });
const serviceRead = requireWorkspacePermission({ service: ["read"] });
const serviceCreate = requireWorkspacePermission({ service: ["create"] });
const workspaceUpdate = requireWorkspacePermission({ workspace: ["update"] });
const incidentRead = requireWorkspacePermission({ incident: ["read"] });
const incidentCreate = requireWorkspacePermission({ incident: ["create"] });

const workspaceStateRoute = createRoute({
  method: "get",
  operationId: "getRelayOpsWorkspaceState",
  path: "/workspaces/{workspaceId}",
  tags: ["RelayOps"],
  summary: "Get RelayOps rollout and legacy archive state",
  middleware: [
    access,
    requireWorkspacePermission({ workspace: ["read"] }),
  ] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("RelayOps workspace state", relayOpsWorkspaceSchema),
    403: errorResponse("No workspace access"),
    404: errorResponse("Workspace not found"),
  },
});

const activateRoute = createRoute({
  method: "post",
  operationId: "activateRelayOpsWorkspace",
  path: "/workspaces/{workspaceId}/activate",
  tags: ["RelayOps"],
  summary: "Explicitly opt a workspace into RelayOps",
  description:
    "Switches the workspace product mode. Existing Project and Task rows remain available through the read-only archive and export.",
  middleware: [access, workspaceUpdate] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Activated RelayOps workspace", relayOpsWorkspaceSchema),
    403: errorResponse("Missing workspace:update permission"),
    404: errorResponse("Workspace not found"),
  },
});

const listServicesRoute = createRoute({
  method: "get",
  operationId: "listRelayOpsServices",
  path: "/workspaces/{workspaceId}/services",
  tags: ["RelayOps"],
  summary: "List the Service Catalog",
  middleware: [access, serviceRead] as const,
  request: { params: workspaceParam, query: listServicesQuery },
  responses: {
    200: jsonResponse("Service Catalog", serviceListSchema),
    403: errorResponse("Missing service:read permission"),
  },
});

const createServiceRoute = createRoute({
  method: "post",
  operationId: "createRelayOpsService",
  path: "/workspaces/{workspaceId}/services",
  tags: ["RelayOps"],
  summary: "Create a RelayOps service",
  middleware: [access, serviceCreate] as const,
  request: {
    params: workspaceParam,
    body: {
      required: true,
      content: { "application/json": { schema: createServiceBody } },
    },
  },
  responses: {
    201: jsonResponse("Created service", serviceSchema),
    400: errorResponse("Invalid service or owner team"),
    403: errorResponse("Missing service:create permission"),
    409: errorResponse("Active service slug already exists"),
  },
});

const getServiceRoute = createRoute({
  method: "get",
  operationId: "getRelayOpsService",
  path: "/workspaces/{workspaceId}/services/{id}",
  tags: ["RelayOps"],
  summary: "Get a RelayOps service",
  middleware: [access, serviceRead] as const,
  request: { params: workspaceResourceParam },
  responses: {
    200: jsonResponse("Service", serviceSchema),
    403: errorResponse("Missing service:read permission"),
    404: errorResponse("Service not found"),
  },
});

const updateServiceRoute = createRoute({
  method: "patch",
  operationId: "updateRelayOpsService",
  path: "/workspaces/{workspaceId}/services/{id}",
  tags: ["RelayOps"],
  summary: "Update a RelayOps service",
  middleware: [access] as const,
  request: {
    params: workspaceResourceParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateServiceBody } },
    },
  },
  responses: {
    200: jsonResponse("Updated service", serviceSchema),
    400: errorResponse("Invalid service or owner team"),
    403: errorResponse("Missing workspace:update permission"),
    404: errorResponse("Service not found"),
    409: errorResponse("Active service slug already exists"),
  },
});

const serviceCommand = (command: "archive" | "unarchive") =>
  createRoute({
    method: "post",
    operationId:
      command === "archive"
        ? "archiveRelayOpsService"
        : "unarchiveRelayOpsService",
    path: `/workspaces/{workspaceId}/services/{id}/${command}`,
    tags: ["RelayOps"],
    summary:
      command === "archive"
        ? "Archive a RelayOps service"
        : "Restore an archived RelayOps service",
    middleware: [access] as const,
    request: { params: workspaceResourceParam },
    responses: {
      200: jsonResponse("Service", serviceSchema),
      403: errorResponse("Missing workspace:update permission"),
      404: errorResponse("Service not found"),
      409: errorResponse("Service state or slug conflicts"),
    },
  });

const archiveServiceRoute = serviceCommand("archive");
const unarchiveServiceRoute = serviceCommand("unarchive");

const teamsRoute = createRoute({
  method: "get",
  operationId: "listRelayOpsServiceOwnerTeams",
  path: "/workspaces/{workspaceId}/teams",
  tags: ["RelayOps"],
  summary: "List teams available for Service ownership",
  middleware: [access, serviceRead] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Workspace teams", z.array(relayOpsTeamSchema)),
    403: errorResponse("Missing service:read permission"),
  },
});

const overviewRoute = createRoute({
  method: "get",
  operationId: "getRelayOpsOverview",
  path: "/workspaces/{workspaceId}/overview",
  tags: ["RelayOps"],
  summary: "Get the operational overview",
  middleware: [access, serviceRead, incidentRead] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Operations Overview", overviewSchema),
    403: errorResponse("Missing Service or Incident read permission"),
  },
});

const demoRoute = createRoute({
  method: "post",
  operationId: "createRelayOpsDemoIncident",
  path: "/workspaces/{workspaceId}/demo-data",
  tags: ["RelayOps"],
  summary: "Create the deterministic onboarding demo incident",
  middleware: [access, incidentCreate] as const,
  request: {
    params: workspaceParam,
    body: {
      required: true,
      content: { "application/json": { schema: createDemoDataBody } },
    },
  },
  responses: {
    201: jsonResponse("Demo incident", incidentDetailSchema),
    403: errorResponse("Missing incident:create permission"),
    404: errorResponse("Service not found"),
  },
});

const cleanupDemoRoute = createRoute({
  method: "delete",
  operationId: "deleteRelayOpsDemoData",
  path: "/workspaces/{workspaceId}/demo-data",
  tags: ["RelayOps"],
  summary: "Atomically remove server-marked RelayOps demo data",
  middleware: [access, workspaceUpdate] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Deleted demo records", demoCleanupSchema),
    403: errorResponse("Missing workspace:update permission"),
  },
});

const legacyArchiveRoute = createRoute({
  method: "get",
  operationId: "getRelayOpsLegacyArchive",
  path: "/workspaces/{workspaceId}/legacy",
  tags: ["RelayOps"],
  summary: "List preserved Kaneo projects in the read-only archive",
  middleware: [
    access,
    requireWorkspacePermission({ project: ["read"] }),
  ] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Legacy archive", legacyArchiveSchema),
    403: errorResponse("Missing project:read permission"),
  },
});

const legacyExportRoute = createRoute({
  method: "get",
  operationId: "exportRelayOpsLegacyArchive",
  path: "/workspaces/{workspaceId}/legacy/export",
  tags: ["RelayOps"],
  summary: "Export preserved Kaneo Project and Task data",
  middleware: [
    access,
    requireWorkspacePermission({ project: ["read"] }),
  ] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Legacy Project and Task export", legacyExportSchema),
    403: errorResponse("Missing project:read permission"),
  },
});

const createIncidentRoute = createRoute({
  method: "post",
  operationId: "createRelayOpsIncident",
  path: "/workspaces/{workspaceId}/incidents",
  tags: ["RelayOps"],
  summary: "Create a detected incident with its durable timeline event",
  description:
    "Atomically writes the incident, incident.created event, and delivery outbox record.",
  middleware: [access, incidentCreate] as const,
  request: {
    params: workspaceParam,
    body: {
      required: true,
      content: { "application/json": { schema: createIncidentBody } },
    },
  },
  responses: {
    201: jsonResponse("Created incident detail", incidentDetailSchema),
    400: errorResponse("Invalid request"),
    403: errorResponse("Missing incident:create permission"),
    404: errorResponse("Service not found in the workspace"),
    422: errorResponse("Archived service cannot receive incidents"),
  },
});

const getIncidentRoute = createRoute({
  method: "get",
  operationId: "getRelayOpsIncident",
  path: "/workspaces/{workspaceId}/incidents/{id}",
  tags: ["RelayOps"],
  summary: "Get an incident and its authoritative durable timeline",
  middleware: [access, incidentRead] as const,
  request: { params: workspaceResourceParam },
  responses: {
    200: jsonResponse("Incident detail", incidentDetailSchema),
    403: errorResponse("Missing incident:read permission"),
    404: errorResponse("Incident not found"),
  },
});

const transitionIncidentRoute = createRoute({
  method: "post",
  operationId: "transitionRelayOpsIncident",
  path: "/workspaces/{workspaceId}/incidents/{id}/transition",
  tags: ["RelayOps"],
  summary: "Apply one canonical incident lifecycle transition",
  middleware: [access, incidentRead] as const,
  request: {
    params: workspaceResourceParam,
    body: {
      required: true,
      content: { "application/json": { schema: transitionIncidentBody } },
    },
  },
  responses: {
    200: jsonResponse("Transitioned incident", incidentDetailSchema),
    400: errorResponse("Invalid command"),
    403: errorResponse("Missing lifecycle capability"),
    404: errorResponse("Incident not found"),
    409: jsonResponse(
      "Optimistic version conflict",
      incidentVersionConflictSchema,
    ),
    422: errorResponse("Transition is not allowed"),
  },
});

const changeIncidentSeverityRoute = createRoute({
  method: "post",
  operationId: "changeRelayOpsIncidentSeverity",
  path: "/workspaces/{workspaceId}/incidents/{id}/severity",
  tags: ["RelayOps"],
  summary: "Change incident severity with optimistic versioning",
  middleware: [access, incidentRead] as const,
  request: {
    params: workspaceResourceParam,
    body: {
      required: true,
      content: { "application/json": { schema: changeIncidentSeverityBody } },
    },
  },
  responses: {
    200: jsonResponse("Updated incident severity", incidentDetailSchema),
    400: errorResponse("Invalid command"),
    403: errorResponse("Missing severity capability"),
    404: errorResponse("Incident not found"),
    409: jsonResponse(
      "Optimistic version conflict",
      incidentVersionConflictSchema,
    ),
    422: errorResponse("Severity is unchanged"),
  },
});

const publishIncidentUpdateRoute = createRoute({
  method: "post",
  operationId: "publishRelayOpsIncidentUpdate",
  path: "/workspaces/{workspaceId}/incidents/{id}/updates",
  tags: ["RelayOps"],
  summary: "Publish an append-only durable incident update",
  middleware: [access, incidentRead] as const,
  request: {
    params: workspaceResourceParam,
    body: {
      required: true,
      content: { "application/json": { schema: publishIncidentUpdateBody } },
    },
  },
  responses: {
    200: jsonResponse("Incident update published", incidentDetailSchema),
    400: errorResponse("Invalid command"),
    403: errorResponse("Missing timeline publish capability"),
    404: errorResponse("Incident not found"),
    409: jsonResponse(
      "Optimistic version conflict",
      incidentVersionConflictSchema,
    ),
  },
});

const assignIncidentParticipantsRoute = createRoute({
  method: "post",
  operationId: "assignRelayOpsIncidentParticipants",
  path: "/workspaces/{workspaceId}/incidents/{id}/participants",
  tags: ["RelayOps"],
  summary: "Assign the incident commander, responders, and affected services",
  middleware: [access, incidentRead] as const,
  request: {
    params: workspaceResourceParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: assignIncidentParticipantsBody },
      },
    },
  },
  responses: {
    200: jsonResponse("Updated incident participants", incidentDetailSchema),
    400: errorResponse("Invalid command"),
    403: errorResponse("Missing assignment capability"),
    404: errorResponse("Incident not found"),
    409: jsonResponse(
      "Optimistic version conflict",
      incidentVersionConflictSchema,
    ),
    422: errorResponse("Participant does not belong to the workspace"),
  },
});

const correctIncidentTimestampsRoute = createRoute({
  method: "post",
  operationId: "correctRelayOpsIncidentTimestamps",
  path: "/workspaces/{workspaceId}/incidents/{id}/timestamps/correct",
  tags: ["RelayOps"],
  summary: "Append a compensating incident timestamp correction",
  middleware: [access, incidentRead] as const,
  request: {
    params: workspaceResourceParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: correctIncidentTimestampsBody },
      },
    },
  },
  responses: {
    200: jsonResponse("Corrected incident timestamps", incidentDetailSchema),
    400: errorResponse("Invalid command"),
    403: errorResponse("Missing timeline correction capability"),
    404: errorResponse("Incident not found"),
    409: jsonResponse(
      "Optimistic version conflict",
      incidentVersionConflictSchema,
    ),
    422: errorResponse("Timestamp invariants failed"),
  },
});

const incidentTimelineRoute = createRoute({
  method: "get",
  operationId: "listRelayOpsIncidentTimeline",
  path: "/workspaces/{workspaceId}/incidents/{id}/timeline",
  tags: ["RelayOps"],
  summary: "List the append-only incident timeline with a scoped cursor",
  middleware: [access, incidentRead] as const,
  request: { params: workspaceResourceParam, query: incidentTimelineQuery },
  responses: {
    200: jsonResponse("Incident timeline page", incidentTimelinePageSchema),
    400: errorResponse("Invalid timeline cursor"),
    403: errorResponse("Missing incident read capability"),
    404: errorResponse("Incident not found"),
  },
});

const listIncidentsRoute = createRoute({
  method: "get",
  operationId: "listRelayOpsIncidents",
  path: "/workspaces/{workspaceId}/incidents",
  tags: ["RelayOps"],
  summary:
    "Query the Incident Workbench with server filters and cursor pagination",
  middleware: [access, incidentRead] as const,
  request: { params: workspaceParam, query: incidentWorkbenchQuery },
  responses: {
    200: jsonResponse("Incident Workbench page", incidentWorkbenchPageSchema),
    400: errorResponse("Invalid filter, sort, date, or cursor"),
    403: errorResponse("Missing incident:read permission"),
  },
});

const listSavedViewsRoute = createRoute({
  method: "get",
  operationId: "listRelayOpsSavedViews",
  path: "/workspaces/{workspaceId}/saved-views",
  tags: ["RelayOps"],
  summary: "List private and authorized workspace saved views",
  middleware: [access] as const,
  request: { params: workspaceParam },
  responses: {
    200: jsonResponse("Saved views", savedViewListSchema),
    403: errorResponse("Missing saved_view:read permission"),
  },
});

const createSavedViewRoute = createRoute({
  method: "post",
  operationId: "createRelayOpsSavedView",
  path: "/workspaces/{workspaceId}/saved-views",
  tags: ["RelayOps"],
  summary: "Create a versioned Incident Workbench saved view",
  middleware: [access] as const,
  request: {
    params: workspaceParam,
    body: {
      required: true,
      content: { "application/json": { schema: createSavedViewBody } },
    },
  },
  responses: {
    201: jsonResponse("Created saved view", savedViewSchema),
    403: errorResponse("Missing saved-view create or share permission"),
    409: errorResponse("Saved-view name already exists"),
  },
});

const updateSavedViewRoute = createRoute({
  method: "patch",
  operationId: "updateRelayOpsSavedView",
  path: "/workspaces/{workspaceId}/saved-views/{id}",
  tags: ["RelayOps"],
  summary: "Update a saved view with optimistic versioning",
  middleware: [access] as const,
  request: {
    params: workspaceResourceParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateSavedViewBody } },
    },
  },
  responses: {
    200: jsonResponse("Updated saved view", savedViewSchema),
    403: errorResponse("Saved view is not writable"),
    404: errorResponse("Saved view not found"),
    409: jsonResponse(
      "Optimistic saved-view version conflict",
      savedViewVersionConflictSchema,
    ),
  },
});

const deleteSavedViewRoute = createRoute({
  method: "delete",
  operationId: "deleteRelayOpsSavedView",
  path: "/workspaces/{workspaceId}/saved-views/{id}",
  tags: ["RelayOps"],
  summary: "Delete a saved view with optimistic versioning",
  middleware: [access] as const,
  request: { params: workspaceResourceParam, query: deleteSavedViewQuery },
  responses: {
    200: jsonResponse("Deleted saved view", savedViewDeleteSchema),
    403: errorResponse("Saved view is not writable"),
    404: errorResponse("Saved view not found"),
    409: jsonResponse(
      "Optimistic saved-view version conflict",
      savedViewVersionConflictSchema,
    ),
  },
});
const relayops = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(workspaceStateRoute, async (c) =>
    c.json(await getWorkspaceState(c.get("workspaceId")), 200),
  )
  .openapi(activateRoute, async (c) =>
    c.json(await activateRelayOps(c.get("workspaceId")), 200),
  )
  .openapi(listServicesRoute, async (c) =>
    c.json(await listServices(c.get("workspaceId"), c.req.valid("query")), 200),
  )
  .openapi(createServiceRoute, async (c) =>
    c.json(await createService(c.get("workspaceId"), c.req.valid("json")), 201),
  )
  .openapi(getServiceRoute, async (c) =>
    c.json(
      await getService(c.get("workspaceId"), c.req.valid("param").id),
      200,
    ),
  )
  .openapi(updateServiceRoute, async (c) =>
    c.json(
      await updateService(
        c.get("workspaceId"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .openapi(archiveServiceRoute, async (c) =>
    c.json(
      await archiveService(c.get("workspaceId"), c.req.valid("param").id),
      200,
    ),
  )
  .openapi(unarchiveServiceRoute, async (c) =>
    c.json(
      await unarchiveService(c.get("workspaceId"), c.req.valid("param").id),
      200,
    ),
  )
  .openapi(teamsRoute, async (c) =>
    c.json(await listTeams(c.get("workspaceId")), 200),
  )
  .openapi(overviewRoute, async (c) =>
    c.json(await getOverview(c.get("workspaceId")), 200),
  )
  .openapi(demoRoute, async (c) =>
    c.json(
      await createDemoIncident(
        c.get("workspaceId"),
        c.get("userId"),
        c.req.valid("json").serviceId,
      ),
      201,
    ),
  )
  .openapi(cleanupDemoRoute, async (c) =>
    c.json(await removeDemoData(c.get("workspaceId")), 200),
  )
  .openapi(legacyArchiveRoute, async (c) =>
    c.json(await getLegacyArchive(c.get("workspaceId")), 200),
  )
  .openapi(legacyExportRoute, async (c) =>
    c.json(await exportLegacyData(c.get("workspaceId")), 200),
  )
  .openapi(createIncidentRoute, async (c) =>
    c.json(
      await createIncident(
        c.get("workspaceId"),
        c.get("userId"),
        c.req.valid("json"),
      ),
      201,
    ),
  )
  .openapi(getIncidentRoute, async (c) =>
    c.json(
      await getIncidentDetail(c.get("workspaceId"), c.req.valid("param").id),
      200,
    ),
  )
  .openapi(transitionIncidentRoute, async (c) => {
    const result = await transitionIncident(
      c,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return result.kind === "version_conflict"
      ? c.json(
          {
            code: "version_conflict" as const,
            message: "Incident changed",
            current: result.current,
          },
          409,
        )
      : c.json(result.detail, 200);
  })
  .openapi(changeIncidentSeverityRoute, async (c) => {
    const result = await changeIncidentSeverity(
      c,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return result.kind === "version_conflict"
      ? c.json(
          {
            code: "version_conflict" as const,
            message: "Incident changed",
            current: result.current,
          },
          409,
        )
      : c.json(result.detail, 200);
  })
  .openapi(publishIncidentUpdateRoute, async (c) => {
    const result = await publishIncidentUpdate(
      c,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return result.kind === "version_conflict"
      ? c.json(
          {
            code: "version_conflict" as const,
            message: "Incident changed",
            current: result.current,
          },
          409,
        )
      : c.json(result.detail, 200);
  })
  .openapi(assignIncidentParticipantsRoute, async (c) => {
    const result = await assignIncidentParticipants(
      c,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return result.kind === "version_conflict"
      ? c.json(
          {
            code: "version_conflict" as const,
            message: "Incident changed",
            current: result.current,
          },
          409,
        )
      : c.json(result.detail, 200);
  })
  .openapi(correctIncidentTimestampsRoute, async (c) => {
    const result = await correctIncidentTimestamps(
      c,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return result.kind === "version_conflict"
      ? c.json(
          {
            code: "version_conflict" as const,
            message: "Incident changed",
            current: result.current,
          },
          409,
        )
      : c.json(result.detail, 200);
  })
  .openapi(incidentTimelineRoute, async (c) =>
    c.json(
      await listIncidentTimeline(
        c.get("workspaceId"),
        c.req.valid("param").id,
        c.req.valid("query"),
      ),
      200,
    ),
  )
  .openapi(listIncidentsRoute, async (c) =>
    c.json(
      await listIncidentWorkbench(c.get("workspaceId"), c.req.valid("query")),
      200,
    ),
  )
  .openapi(listSavedViewsRoute, async (c) =>
    c.json(await listSavedViews(c.get("workspaceId"), c.get("userId")), 200),
  )
  .openapi(createSavedViewRoute, async (c) => {
    const canShareWorkspaceViews = await hasWorkspacePermission(c, {
      saved_view: ["share"],
    });
    return c.json(
      await createSavedView(
        c.get("workspaceId"),
        c.get("userId"),
        c.req.valid("json"),
        { canShareWorkspaceViews },
      ),
      201,
    );
  })
  .openapi(updateSavedViewRoute, async (c) => {
    const canShareWorkspaceViews = await hasWorkspacePermission(c, {
      saved_view: ["share"],
    });
    const canManageWorkspaceViews = await hasWorkspacePermission(c, {
      saved_view: ["update"],
    });
    const result = await updateSavedView(
      c.get("workspaceId"),
      c.get("userId"),
      c.req.valid("param").id,
      c.req.valid("json"),
      { canManageWorkspaceViews, canShareWorkspaceViews },
    );
    return result.kind === "version_conflict"
      ? c.json(
          {
            code: "saved_view_version_conflict" as const,
            message: "Saved view changed",
            current: result.current,
          },
          409,
        )
      : c.json(result.savedView, 200);
  })
  .openapi(deleteSavedViewRoute, async (c) => {
    const canManageWorkspaceViews = await hasWorkspacePermission(c, {
      saved_view: ["delete"],
    });
    const result = await deleteSavedView(
      c.get("workspaceId"),
      c.get("userId"),
      c.req.valid("param").id,
      c.req.valid("query").expectedVersion,
      { canManageWorkspaceViews },
    );
    return result.kind === "version_conflict"
      ? c.json(
          {
            code: "saved_view_version_conflict" as const,
            message: "Saved view changed",
            current: result.current,
          },
          409,
        )
      : c.json(result.deleted, 200);
  })
  .route("/", protectedSignalRouter)
  .route("/", analyticsRouter);

export default relayops;
