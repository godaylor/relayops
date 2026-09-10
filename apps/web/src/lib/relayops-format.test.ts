import { describe, expect, it } from "vitest";
import {
  formatRelayOpsDateTime,
  relayOpsElapsedParts,
} from "./relayops-format";

describe("RelayOps locale formatting", () => {
  it.each([
    ["en-US", "Aug 28, 2026"],
    ["de-DE", "28.08.2026"],
    ["ru-RU", "28 авг. 2026 г."],
    ["ja-JP", "2026/08/28"],
  ])("formats the same UTC fact for %s", (locale, expected) => {
    expect(
      formatRelayOpsDateTime(
        "2026-08-28T12:34:00.000Z",
        { dateStyle: "medium", timeZone: "UTC" },
        locale,
      ),
    ).toBe(expected);
  });

  it("keeps elapsed clocks deterministic and non-negative", () => {
    expect(
      relayOpsElapsedParts(
        "2026-08-28T10:00:00.000Z",
        "2026-08-28T12:05:00.000Z",
      ),
    ).toEqual({ hours: 2, minutes: 5 });
    expect(
      relayOpsElapsedParts(
        "2026-08-28T12:05:00.000Z",
        "2026-08-28T10:00:00.000Z",
      ),
    ).toEqual({ hours: 0, minutes: 0 });
  });
});
