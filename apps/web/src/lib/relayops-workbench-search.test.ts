import { describe, expect, it } from "vitest";
import {
  canonicalizeWorkbenchSearch,
  mergeSavedWorkbenchSearch,
  parseWorkbenchSearch,
  serializeWorkbenchSearch,
  shouldResetWorkbenchCursor,
  toSavedWorkbenchDefinition,
} from "./relayops-workbench-search";

const now = new Date("2026-08-28T12:00:00.000Z");

describe("RelayOps workbench search state", () => {
  it("normalizes invalid values and concrete rolling date defaults", () => {
    expect(
      parseWorkbenchSearch(
        {
          q: `  ${"x".repeat(240)}  `,
          status: "resolved,bogus,detected,resolved",
          severity: ["sev2", "oops", "sev1"],
          from: "2026-13-99",
          to: "bad",
          sort: "-bogus",
          columns: "v9:key.title",
          tab: "secret",
        },
        now,
      ),
    ).toEqual({
      view: undefined,
      q: "x".repeat(200),
      status: ["detected", "resolved"],
      severity: ["sev1", "sev2"],
      service: [],
      commander: [],
      from: "2026-07-29",
      to: "2026-08-28",
      sort: [
        { field: "severity", direction: "desc" },
        { field: "detectedAt", direction: "desc" },
      ],
      group: "none",
      density: "compact",
      columns: [
        { id: "key", pin: "left", width: 112 },
        { id: "severity", pin: "left", width: 92 },
        { id: "status", pin: null, width: 124 },
        { id: "title", pin: null, width: 300 },
        { id: "affectedServices", pin: null, width: 220 },
        { id: "commander", pin: null, width: 180 },
        { id: "responders", pin: null, width: 220 },
        { id: "detectedAt", pin: null, width: 180 },
        { id: "elapsed", pin: null, width: 140 },
        { id: "lastUpdateAt", pin: null, width: 180 },
      ],
      incidentId: undefined,
      tab: "overview",
    });
  });

  it("serializes arrays deterministically and round-trips all shareable state", () => {
    const parsed = parseWorkbenchSearch(
      {
        view: "view_1",
        q: "latency",
        status: "triaging,detected",
        severity: "sev3,sev1",
        service: "svc_b,svc_a",
        commander: "usr_b,usr_a",
        from: "2026-08-01",
        to: "2026-08-28",
        sort: "title,-severity,title",
        group: "service",
        density: "comfortable",
        columns: "v1:title~n~320.key~l~112.service~r~180",
        incidentId: "incident_9",
        tab: "timeline",
      },
      now,
    );
    const serialized = serializeWorkbenchSearch(parsed);

    expect(serialized).toContain("status=detected%2Ctriaging");
    expect(serialized).toContain("service=svc_a%2Csvc_b");
    expect(
      parseWorkbenchSearch(
        Object.fromEntries(new URLSearchParams(serialized)),
        now,
      ),
    ).toEqual(parsed);
    expect(
      canonicalizeWorkbenchSearch({ status: "triaging,detected" }, now),
    ).toMatchObject({ search: { status: ["detected", "triaging"] } });
  });

  it("applies system defaults, then saved view, then explicitly present URL fields", () => {
    const saved = toSavedWorkbenchDefinition(
      parseWorkbenchSearch(
        {
          q: "from saved view",
          status: "resolved",
          severity: "sev2",
          density: "comfortable",
        },
        now,
      ),
    );
    const merged = mergeSavedWorkbenchSearch(
      saved,
      { q: "explicit", severity: "bogus", incidentId: "incident_1" },
      now,
    );

    expect(merged).toMatchObject({
      q: "explicit",
      status: ["resolved"],
      severity: [],
      density: "comfortable",
      incidentId: "incident_1",
    });
  });

  it("resets cursor only for server dataset changes", () => {
    const before = parseWorkbenchSearch({}, now);
    expect(
      shouldResetWorkbenchCursor(before, {
        ...before,
        incidentId: "incident_1",
      }),
    ).toBe(false);
    expect(
      shouldResetWorkbenchCursor(before, {
        ...before,
        density: "comfortable",
      }),
    ).toBe(false);
    expect(
      shouldResetWorkbenchCursor(before, { ...before, q: "database" }),
    ).toBe(true);
    expect(
      shouldResetWorkbenchCursor(before, {
        ...before,
        sort: [{ field: "title", direction: "asc" }],
      }),
    ).toBe(true);
  });
});
