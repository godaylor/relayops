import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { webhookAuditMetadata } from "../../../apps/api/src/relayops/signals/audit";
import {
  decodeWebhookEncryptionKey,
  decryptWebhookSecret,
  encryptWebhookSecret,
  signWebhookBody,
  verifyWebhookSignature,
  WebhookEncryptionError,
} from "../../../apps/api/src/relayops/signals/crypto";
import {
  canonicalSignalJson,
  normalizeSignal,
  SignalNormalizationError,
} from "../../../apps/api/src/relayops/signals/normalization";
import {
  assertWebhookJsonContentType,
  getWebhookLimits,
  readBoundedWebhookBody,
  validateWebhookTimestamp,
  WebhookRequestError,
} from "../../../apps/api/src/relayops/signals/request-guards";

describe("RelayOps signal webhook crypto", () => {
  it("signs timestamp plus exact raw bytes and rejects byte changes", () => {
    const secret = "vector-secret";
    const timestamp = "1700000000";
    const rawBody = Buffer.from('{ "title": "Latency", "value": 42 }');
    const expected = `sha256=${createHmac("sha256", secret)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
      .digest("hex")}`;

    expect(signWebhookBody(secret, timestamp, rawBody)).toBe(expected);
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody,
        signature: expected,
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody: Buffer.from('{"title":"Latency","value":42}'),
        signature: expected,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody,
        signature: "not-a-signature",
      }),
    ).toBe(false);
  });

  it("round-trips a versioned AES-256-GCM envelope bound to workspace/source", () => {
    const key = decodeWebhookEncryptionKey(`hex:${"11".repeat(32)}`);
    const envelope = encryptWebhookSecret({
      workspaceId: "workspace-a",
      sourceId: "source-a",
      secret: "one-time-webhook-secret",
      key,
    });

    expect(envelope.keyVersion).toBe(1);
    expect(envelope.encryptedSecret).not.toContain("one-time-webhook-secret");
    expect(
      decryptWebhookSecret({
        workspaceId: "workspace-a",
        sourceId: "source-a",
        envelope,
        key,
      }),
    ).toBe("one-time-webhook-secret");
    expect(() =>
      decryptWebhookSecret({
        workspaceId: "workspace-b",
        sourceId: "source-a",
        envelope,
        key,
      }),
    ).toThrow(WebhookEncryptionError);
  });

  it("fails closed for missing, ambiguous, or wrong-sized keys", () => {
    expect(() => decodeWebhookEncryptionKey(undefined)).toThrow(
      WebhookEncryptionError,
    );
    expect(() => decodeWebhookEncryptionKey("plain-text-key")).toThrow(
      WebhookEncryptionError,
    );
    expect(() => decodeWebhookEncryptionKey("base64:c2hvcnQ=")).toThrow(
      WebhookEncryptionError,
    );
  });
});

describe("RelayOps common signal normalization", () => {
  it("produces a deterministic fingerprint independent of payload key order", () => {
    const left = normalizeSignal(
      {
        externalId: "alert-42",
        title: "  Checkout   latency  ",
        observedAt: "2026-08-28T10:00:00.000Z",
        payload: {
          region: "eu-central",
          value: 1240,
          labels: { zone: "a", environment: "production" },
        },
      },
      { source: "webhook:source-a" },
    );
    const right = normalizeSignal(
      {
        title: "Checkout latency",
        externalId: "alert-42",
        observedAt: "2026-08-28T10:00:00.000Z",
        payload: {
          labels: { environment: "production", zone: "a" },
          value: 1240,
          region: "eu-central",
        },
      },
      { source: "webhook:source-a" },
    );

    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.deduplicationKey).toBe("alert-42");
    expect(canonicalSignalJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{"a":{"x":3,"y":2},"z":1}',
    );
  });

  it("retains only allowlisted payload fields and redacts secret-like text", () => {
    const normalized = normalizeSignal(
      {
        externalId: "alert-secret",
        title: "Authorization: Bearer abc.def",
        summary: "token=top-secret latency rose",
        payload: {
          metric: "latency",
          value: 900,
          password: "never-store",
          callbackUrl: "http://169.254.169.254/latest/meta-data",
          labels: { region: "eu", token: "also-never-store" },
        },
      },
      { source: "manual", now: new Date("2026-08-28T10:00:00Z") },
    );

    const serialized = JSON.stringify(normalized);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("never-store");
    expect(serialized).not.toContain("169.254.169.254");
    expect(normalized.redactedPayload).toMatchObject({
      metric: "latency",
      value: 900,
      labels: { region: "eu" },
    });
  });

  it("rejects malformed objects and oversized operational fields", () => {
    expect(() => normalizeSignal([], { source: "manual" })).toThrow(
      SignalNormalizationError,
    );
    expect(() =>
      normalizeSignal({ title: "x".repeat(201) }, { source: "manual" }),
    ).toThrow(/maximum length/);
  });
});

describe("RelayOps webhook request guards", () => {
  it("accepts JSON media types and rejects all other content types", () => {
    expect(() =>
      assertWebhookJsonContentType("application/json; charset=utf-8"),
    ).not.toThrow();
    expect(() => assertWebhookJsonContentType("text/plain")).toThrow(
      WebhookRequestError,
    );
  });

  it("reads exact bytes within the bound and rejects declared or streamed excess", async () => {
    const bytes = Buffer.from('{ "order": [2, 1] }');
    const request = new Request("http://relayops.test/webhook", {
      method: "POST",
      body: bytes,
      headers: { "content-type": "application/json" },
      duplex: "half",
    } as RequestInit);
    await expect(readBoundedWebhookBody(request, 64)).resolves.toEqual(
      new Uint8Array(bytes),
    );

    const oversized = new Request("http://relayops.test/webhook", {
      method: "POST",
      body: "123456",
      headers: { "content-length": "6" },
    });
    await expect(readBoundedWebhookBody(oversized, 5)).rejects.toMatchObject({
      status: 413,
      code: "body_too_large",
    });
  });

  it("enforces the replay window and bounded repo-local defaults", () => {
    const now = new Date("2026-08-28T10:00:00.000Z");
    const nowSeconds = String(Math.floor(now.getTime() / 1000));
    expect(validateWebhookTimestamp(nowSeconds, now, 300)).toBe(nowSeconds);
    expect(() =>
      validateWebhookTimestamp(
        String(Math.floor(now.getTime() / 1000) - 301),
        now,
        300,
      ),
    ).toThrow(/replay window/);
    expect(
      getWebhookLimits({ RELAYOPS_WEBHOOK_RATE_LIMIT: "999999" }),
    ).toMatchObject({ rateLimit: 60, bodyLimitBytes: 65_536 });
  });

  it("exposes only safe audit metadata", () => {
    const audit = webhookAuditMetadata({
      requestId: "request-1",
      sourceId: "source-1",
      payloadHash: "abc123",
      bodySize: 42,
      outcome: "rejected",
      errorCode: "invalid_signature",
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toMatch(
      /rawBody|header|authorization|secret|token/i,
    );
    expect(Object.keys(audit).sort()).toEqual(
      [
        "bodySize",
        "errorCode",
        "event",
        "outcome",
        "payloadHash",
        "requestId",
        "sourceId",
      ].sort(),
    );
  });
});
