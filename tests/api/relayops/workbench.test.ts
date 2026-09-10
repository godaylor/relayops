import { describe, expect, it } from "vitest";
import {
  createSavedViewBody,
  incidentWorkbenchQuery,
  updateSavedViewBody,
} from "../../../apps/api/src/relayops/workbench-schema";

const definition = {
  q: "",
  status: ["detected"],
  severity: [],
  service: [],
  commander: [],
  from: "2026-08-01",
  to: "2026-08-28",
  sort: [{ field: "severity", direction: "desc" }],
  group: "none",
  density: "compact",
  columns: [
    { id: "key", pin: "left", width: 112 },
    { id: "title", pin: null, width: 300 },
    { id: "severity", pin: null, width: 92 },
  ],
};

describe("RelayOps S4 API schemas", () => {
  it("normalizes comma filters and ordered unique multi-sort", () => {
    expect(
      incidentWorkbenchQuery.parse({
        status: "triaging,detected,triaging",
        severity: ["sev2,sev1"],
        sort: "-severity,title,-severity",
      }),
    ).toMatchObject({
      status: ["detected", "triaging"],
      severity: ["sev1", "sev2"],
      sort: [
        { field: "severity", direction: "desc" },
        { field: "title", direction: "asc" },
      ],
    });
  });

  it("rejects an inverted date range and over-wide page", () => {
    expect(() =>
      incidentWorkbenchQuery.parse({
        from: "2026-08-29",
        to: "2026-08-28",
      }),
    ).toThrow();
    expect(() => incidentWorkbenchQuery.parse({ limit: 101 })).toThrow();
  });

  it("validates canonical saved definitions and optimistic updates", () => {
    expect(
      createSavedViewBody.parse({ name: "Active", definition }),
    ).toMatchObject({ visibility: "private", definition });
    expect(() => updateSavedViewBody.parse({ expectedVersion: 2 })).toThrow();
    expect(
      updateSavedViewBody.parse({
        expectedVersion: 2,
        name: "Active incidents",
      }),
    ).toMatchObject({ expectedVersion: 2, name: "Active incidents" });
  });
});
