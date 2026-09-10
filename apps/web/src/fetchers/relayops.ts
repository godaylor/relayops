import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { WorkbenchSearch } from "@/lib/relayops-workbench-search";

const relayops = client.relayops.workspaces[":workspaceId"];

export class RelayOpsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "RelayOpsApiError";
  }
}

async function expectJson<T>(
  response: Response,
  expectedStatus: number,
): Promise<T> {
  if (response.status !== expectedStatus) {
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : text || "RelayOps request failed";
    throw new RelayOpsApiError(message, response.status, body);
  }
  return response.json() as Promise<T>;
}

export type RelayOpsWorkspaceState = InferResponseType<
  (typeof relayops)["$get"],
  200
>;

export async function getRelayOpsWorkspaceState(workspaceId: string) {
  const response = await relayops.$get({ param: { workspaceId } });
  return expectJson<RelayOpsWorkspaceState>(response, 200);
}

export async function activateRelayOpsWorkspace(workspaceId: string) {
  const response = await relayops.activate.$post({ param: { workspaceId } });
  return expectJson<RelayOpsWorkspaceState>(response, 200);
}

export type RelayOpsService = InferResponseType<
  (typeof relayops.services)["$get"],
  200
>[number];
export type RelayOpsServiceInput = InferRequestType<
  (typeof relayops.services)["$post"]
>["json"];
export type RelayOpsServiceUpdate = InferRequestType<
  (typeof relayops.services)[":id"]["$patch"]
>["json"];

export async function listRelayOpsServices(
  workspaceId: string,
  query: { q?: string; status?: "active" | "archived" | "all" } = {},
) {
  const response = await relayops.services.$get({
    param: { workspaceId },
    query: { q: query.q, status: query.status ?? "active" },
  });
  return expectJson<RelayOpsService[]>(response, 200);
}

export async function createRelayOpsService(
  workspaceId: string,
  json: RelayOpsServiceInput,
) {
  const response = await relayops.services.$post({
    param: { workspaceId },
    json,
  });
  return expectJson<RelayOpsService>(response, 201);
}

export async function getRelayOpsService(workspaceId: string, id: string) {
  const response = await relayops.services[":id"].$get({
    param: { workspaceId, id },
  });
  return expectJson<RelayOpsService>(response, 200);
}

export async function updateRelayOpsService(
  workspaceId: string,
  id: string,
  json: RelayOpsServiceUpdate,
) {
  const response = await relayops.services[":id"].$patch({
    param: { workspaceId, id },
    json,
  });
  return expectJson<RelayOpsService>(response, 200);
}

export async function setRelayOpsServiceArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
) {
  const resource = archived
    ? relayops.services[":id"].archive
    : relayops.services[":id"].unarchive;
  const response = await resource.$post({ param: { workspaceId, id } });
  return expectJson<RelayOpsService>(response, 200);
}

export type RelayOpsTeam = InferResponseType<
  (typeof relayops.teams)["$get"],
  200
>[number];

export async function listRelayOpsTeams(workspaceId: string) {
  const response = await relayops.teams.$get({ param: { workspaceId } });
  return expectJson<RelayOpsTeam[]>(response, 200);
}

export type RelayOpsOverview = InferResponseType<
  (typeof relayops.overview)["$get"],
  200
>;

export async function getRelayOpsOverview(workspaceId: string) {
  const response = await relayops.overview.$get({ param: { workspaceId } });
  return expectJson<RelayOpsOverview>(response, 200);
}

export type RelayOpsIncidentDetail = InferResponseType<
  (typeof relayops.incidents)["$post"],
  201
>;

type CreateIncidentRequest = InferRequestType<
  (typeof relayops.incidents)["$post"]
>["json"];

export async function createRelayOpsIncident(
  workspaceId: string,
  json: CreateIncidentRequest,
) {
  const response = await relayops.incidents.$post({
    param: { workspaceId },
    json,
  });
  return expectJson<RelayOpsIncidentDetail>(response, 201);
}

export async function getRelayOpsIncident(workspaceId: string, id: string) {
  const response = await relayops.incidents[":id"].$get({
    param: { workspaceId, id },
  });
  return expectJson<RelayOpsIncidentDetail>(response, 200);
}
type IncidentResource = (typeof relayops.incidents)[":id"];

export type RelayOpsTransitionInput = InferRequestType<
  IncidentResource["transition"]["$post"]
>["json"];
export type RelayOpsSeverityInput = InferRequestType<
  IncidentResource["severity"]["$post"]
>["json"];
export type RelayOpsUpdateInput = InferRequestType<
  IncidentResource["updates"]["$post"]
>["json"];
export type RelayOpsParticipantsInput = InferRequestType<
  IncidentResource["participants"]["$post"]
>["json"];
export type RelayOpsTimestampCorrectionInput = InferRequestType<
  IncidentResource["timestamps"]["correct"]["$post"]
>["json"];

export type RelayOpsVersionConflict = InferResponseType<
  IncidentResource["transition"]["$post"],
  409
>;

export function isRelayOpsVersionConflict(
  error: unknown,
): error is RelayOpsApiError & { body: RelayOpsVersionConflict } {
  return (
    error instanceof RelayOpsApiError &&
    error.status === 409 &&
    Boolean(
      error.body &&
        typeof error.body === "object" &&
        "code" in error.body &&
        error.body.code === "version_conflict",
    )
  );
}

export async function transitionRelayOpsIncident(
  workspaceId: string,
  id: string,
  json: RelayOpsTransitionInput,
) {
  const response = await relayops.incidents[":id"].transition.$post({
    param: { workspaceId, id },
    json,
  });
  return expectJson<RelayOpsIncidentDetail>(response, 200);
}

export async function changeRelayOpsIncidentSeverity(
  workspaceId: string,
  id: string,
  json: RelayOpsSeverityInput,
) {
  const response = await relayops.incidents[":id"].severity.$post({
    param: { workspaceId, id },
    json,
  });
  return expectJson<RelayOpsIncidentDetail>(response, 200);
}

export async function publishRelayOpsIncidentUpdate(
  workspaceId: string,
  id: string,
  json: RelayOpsUpdateInput,
) {
  const response = await relayops.incidents[":id"].updates.$post({
    param: { workspaceId, id },
    json,
  });
  return expectJson<RelayOpsIncidentDetail>(response, 200);
}

export async function assignRelayOpsIncidentParticipants(
  workspaceId: string,
  id: string,
  json: RelayOpsParticipantsInput,
) {
  const response = await relayops.incidents[":id"].participants.$post({
    param: { workspaceId, id },
    json,
  });
  return expectJson<RelayOpsIncidentDetail>(response, 200);
}

export async function correctRelayOpsIncidentTimestamps(
  workspaceId: string,
  id: string,
  json: RelayOpsTimestampCorrectionInput,
) {
  const response = await relayops.incidents[":id"].timestamps.correct.$post({
    param: { workspaceId, id },
    json,
  });
  return expectJson<RelayOpsIncidentDetail>(response, 200);
}

export async function listRelayOpsIncidentTimeline(
  workspaceId: string,
  id: string,
  query: { cursor?: string; limit?: number } = {},
) {
  const response = await relayops.incidents[":id"].timeline.$get({
    param: { workspaceId, id },
    query: {
      cursor: query.cursor,
      limit: query.limit?.toString() ?? "50",
    },
  });
  return expectJson(response, 200);
}

export type RelayOpsWorkbenchPage = InferResponseType<
  (typeof relayops.incidents)["$get"],
  200
>;

export async function listRelayOpsWorkbench(
  workspaceId: string,
  search: WorkbenchSearch,
  cursor?: string,
) {
  const response = await relayops.incidents.$get({
    param: { workspaceId },
    query: {
      q: search.q || undefined,
      status: search.status.length > 0 ? search.status.join(",") : undefined,
      severity:
        search.severity.length > 0 ? search.severity.join(",") : undefined,
      service: search.service.length > 0 ? search.service.join(",") : undefined,
      commander:
        search.commander.length > 0 ? search.commander.join(",") : undefined,
      from: search.from,
      to: search.to,
      sort: search.sort
        .map(({ field, direction }) =>
          direction === "desc" ? `-${field}` : field,
        )
        .join(","),
      group: search.group,
      cursor,
      limit: "50",
    },
  });
  return expectJson<RelayOpsWorkbenchPage>(response, 200);
}

const savedViews = relayops["saved-views"];
export type RelayOpsSavedView = InferResponseType<
  (typeof savedViews)["$get"],
  200
>[number];
export type RelayOpsSavedViewCreateInput = InferRequestType<
  (typeof savedViews)["$post"]
>["json"];
export type RelayOpsSavedViewUpdateInput = InferRequestType<
  (typeof savedViews)[":id"]["$patch"]
>["json"];
export type RelayOpsSavedViewConflict = InferResponseType<
  (typeof savedViews)[":id"]["$patch"],
  409
>;

export function isRelayOpsSavedViewConflict(
  error: unknown,
): error is RelayOpsApiError & { body: RelayOpsSavedViewConflict } {
  return (
    error instanceof RelayOpsApiError &&
    error.status === 409 &&
    Boolean(
      error.body &&
        typeof error.body === "object" &&
        "code" in error.body &&
        error.body.code === "saved_view_version_conflict",
    )
  );
}

export async function listRelayOpsSavedViews(workspaceId: string) {
  const response = await savedViews.$get({ param: { workspaceId } });
  return expectJson<RelayOpsSavedView[]>(response, 200);
}

export async function createRelayOpsSavedView(
  workspaceId: string,
  json: RelayOpsSavedViewCreateInput,
) {
  const response = await savedViews.$post({ param: { workspaceId }, json });
  return expectJson<RelayOpsSavedView>(response, 201);
}

export async function updateRelayOpsSavedView(
  workspaceId: string,
  id: string,
  json: RelayOpsSavedViewUpdateInput,
) {
  const response = await savedViews[":id"].$patch({
    param: { workspaceId, id },
    json,
  });
  return expectJson<RelayOpsSavedView>(response, 200);
}

export async function deleteRelayOpsSavedView(
  workspaceId: string,
  id: string,
  expectedVersion: number,
) {
  const response = await savedViews[":id"].$delete({
    param: { workspaceId, id },
    query: { expectedVersion: String(expectedVersion) },
  });
  return expectJson(response, 200);
}
export async function createRelayOpsDemoIncident(
  workspaceId: string,
  serviceId: string,
) {
  const response = await relayops["demo-data"].$post({
    param: { workspaceId },
    json: { serviceId },
  });
  return expectJson<RelayOpsIncidentDetail>(response, 201);
}
const relayOpsSignals = relayops.signals;
export type RelayOpsSignal = InferResponseType<
  (typeof relayOpsSignals)["$get"],
  200
>[number];
export type RelayOpsManualSignalInput = InferRequestType<
  (typeof relayOpsSignals)["$post"]
>["json"];
export type RelayOpsSignalAttachmentInput = InferRequestType<
  (typeof relayops.incidents)[":incidentId"]["signals"][":signalId"]["$post"]
>["json"];

export async function listRelayOpsSignals(
  workspaceId: string,
  query: {
    status?: "new" | "attached" | "all";
    serviceId?: string;
    limit?: number;
  } = {},
) {
  const response = await relayOpsSignals.$get({
    param: { workspaceId },
    query: {
      status: query.status ?? "all",
      serviceId: query.serviceId,
      limit: String(query.limit ?? 50),
    },
  });
  return expectJson<RelayOpsSignal[]>(response, 200);
}

export async function createRelayOpsManualSignal(
  workspaceId: string,
  json: RelayOpsManualSignalInput,
) {
  const response = await relayOpsSignals.$post({
    param: { workspaceId },
    json,
  });
  return expectJson(response, 201);
}

export async function createRelayOpsDemoSignal(
  workspaceId: string,
  serviceId: string,
) {
  const response = await relayOpsSignals.demo.$post({
    param: { workspaceId },
    json: { serviceId },
  });
  return expectJson(response, 201);
}

export async function attachRelayOpsSignal(
  workspaceId: string,
  incidentId: string,
  signalId: string,
  json: RelayOpsSignalAttachmentInput,
) {
  const response = await relayops.incidents[":incidentId"].signals[
    ":signalId"
  ].$post({
    param: { workspaceId, incidentId, signalId },
    json,
  });
  return expectJson(response, 200);
}

export async function removeRelayOpsDemoData(workspaceId: string) {
  const response = await relayops["demo-data"].$delete({
    param: { workspaceId },
  });
  return expectJson<{
    incidents: number;
    services: number;
    outboxEvents: number;
  }>(response, 200);
}

export type RelayOpsLegacyArchive = InferResponseType<
  (typeof relayops.legacy)["$get"],
  200
>;

export async function getRelayOpsLegacyArchive(workspaceId: string) {
  const response = await relayops.legacy.$get({ param: { workspaceId } });
  return expectJson<RelayOpsLegacyArchive>(response, 200);
}

export async function exportRelayOpsLegacyData(workspaceId: string) {
  const response = await relayops.legacy.export.$get({
    param: { workspaceId },
  });
  return expectJson<unknown>(response, 200);
}
