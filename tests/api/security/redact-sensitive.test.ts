import { describe, expect, it } from "vitest";
import { redactSensitive } from "../../../apps/api/src/utils/redact-sensitive";

describe("sensitive value redaction", () => {
  it("redacts nested credentials and token-bearing URLs", () => {
    const redacted = redactSensitive({
      authorization: "Bearer top-secret",
      nested: {
        message: "request failed: https://host/message?token=abc123&x=1",
        harmless: "visible",
      },
    });
    expect(JSON.stringify(redacted)).not.toContain("top-secret");
    expect(JSON.stringify(redacted)).not.toContain("abc123");
    expect(redacted).toMatchObject({
      authorization: "[REDACTED]",
      nested: { harmless: "visible" },
    });
  });
});
