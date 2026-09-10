import { describe, expect, it } from "vitest";
import { parseRelayOpsSearch } from "./relayops-search";

describe("parseRelayOpsSearch", () => {
  it("keeps a valid incident deep link and timeline tab", () => {
    expect(
      parseRelayOpsSearch({ incidentId: "inc-1", tab: "timeline" }),
    ).toEqual({ incidentId: "inc-1", tab: "timeline" });
  });

  it("drops invalid incident ids and normalizes unknown tabs", () => {
    expect(
      parseRelayOpsSearch({ incidentId: ["inc-1"], tab: "settings" }),
    ).toEqual({ incidentId: undefined, tab: "timeline" });
  });
});
