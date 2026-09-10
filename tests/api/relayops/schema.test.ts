import { describe, expect, it } from "vitest";
import {
  assignIncidentParticipantsBody,
  changeIncidentSeverityBody,
  correctIncidentTimestampsBody,
  createIncidentBody,
  createServiceBody,
  incidentTimelineQuery,
  transitionIncidentBody,
  updateServiceBody,
} from "../../../apps/api/src/relayops/schema";

describe("RelayOps request validators", () => {
  it("accepts the minimal Service and Incident payloads", () => {
    expect(createServiceBody.parse({ name: "API", slug: "api" })).toEqual({
      name: "API",
      slug: "api",
      tier: "standard",
      health: "operational",
    });
    expect(
      createIncidentBody.parse({
        serviceId: "svc",
        title: "Latency",
        idempotencyKey: "request-1",
      }),
    ).toMatchObject({ severity: "unknown", impact: "unknown" });
  });

  it("rejects invalid slugs, severities, and short idempotency keys", () => {
    expect(() =>
      createServiceBody.parse({ name: "API", slug: "API prod" }),
    ).toThrow();
    expect(() =>
      createIncidentBody.parse({
        serviceId: "svc",
        title: "Latency",
        severity: "critical",
        idempotencyKey: "short",
      }),
    ).toThrow();
  });

  it("accepts public HTTP links and rejects unsafe URL schemes", () => {
    expect(
      createServiceBody.parse({
        name: "API",
        slug: "api",
        repositoryUrl: "https://github.com/example/api",
        runbookUrl: "https://ops.example.test/runbooks/api",
      }),
    ).toMatchObject({
      tier: "standard",
      health: "operational",
    });
    for (const repositoryUrl of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/plain,secret",
    ]) {
      expect(() =>
        createServiceBody.parse({ name: "API", slug: "api", repositoryUrl }),
      ).toThrow();
    }
    expect(() => updateServiceBody.parse({})).toThrow();
  });

  it("validates optimistic lifecycle commands", () => {
    expect(
      transitionIncidentBody.parse({
        expectedVersion: 3,
        idempotencyKey: "transition-request-1",
        to: "monitoring",
      }),
    ).toMatchObject({ expectedVersion: 3, to: "monitoring" });
    expect(() =>
      transitionIncidentBody.parse({
        expectedVersion: 3,
        idempotencyKey: "transition-request-2",
        to: "resolved",
      }),
    ).toThrow();
    expect(
      changeIncidentSeverityBody.parse({
        expectedVersion: 3,
        idempotencyKey: "severity-request-1",
        severity: "sev2",
      }),
    ).toMatchObject({ severity: "sev2" });
  });

  it("requires an explicit participant field and a timestamp correction", () => {
    expect(() =>
      assignIncidentParticipantsBody.parse({
        expectedVersion: 1,
        idempotencyKey: "participants-request-1",
      }),
    ).toThrow();
    expect(
      assignIncidentParticipantsBody.parse({
        expectedVersion: 1,
        idempotencyKey: "participants-request-2",
        commanderId: null,
      }),
    ).toMatchObject({ commanderId: null });
    expect(() =>
      correctIncidentTimestampsBody.parse({
        expectedVersion: 1,
        idempotencyKey: "timestamps-request-1",
        reason: "Correct source timestamp",
      }),
    ).toThrow();
  });

  it("bounds durable timeline pagination", () => {
    expect(incidentTimelineQuery.parse({})).toEqual({ limit: 50 });
    expect(incidentTimelineQuery.parse({ limit: "100" })).toEqual({
      limit: 100,
    });
    expect(() => incidentTimelineQuery.parse({ limit: "101" })).toThrow();
  });
});
