import { describe, expect, it } from "vitest";
import { normalizeApiServerUrl } from "../../../apps/api/src/utils/openapi-spec";

describe("normalizeApiServerUrl", () => {
  it("preserves the portable same-origin API path", () => {
    expect(normalizeApiServerUrl("/api")).toBe("/api");
  });
  it("appends /api when the base has no api suffix", () => {
    expect(normalizeApiServerUrl("https://relayops.example")).toBe(
      "https://relayops.example/api",
    );
  });

  it("leaves a URL that already ends with /api alone", () => {
    expect(normalizeApiServerUrl("https://relayops.example/api")).toBe(
      "https://relayops.example/api",
    );
  });

  it("strips trailing slashes before appending", () => {
    expect(normalizeApiServerUrl("https://relayops.example///")).toBe(
      "https://relayops.example/api",
    );
    expect(normalizeApiServerUrl("https://relayops.example/api/")).toBe(
      "https://relayops.example/api",
    );
  });
});
