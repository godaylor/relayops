import { randomUUID } from "node:crypto";

export const DEFAULT_WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;
export const DEFAULT_WEBHOOK_RATE_LIMIT = 60;
export const DEFAULT_WEBHOOK_RATE_WINDOW_SECONDS = 60;
export const DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS = 300;

export class WebhookRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 413 | 415 | 422 | 429 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WebhookRequestError";
  }
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

export function getWebhookLimits(env = process.env) {
  return {
    bodyLimitBytes: boundedInteger(
      env.RELAYOPS_WEBHOOK_BODY_LIMIT_BYTES,
      DEFAULT_WEBHOOK_BODY_LIMIT_BYTES,
      1_024,
      1024 * 1024,
    ),
    rateLimit: boundedInteger(
      env.RELAYOPS_WEBHOOK_RATE_LIMIT,
      DEFAULT_WEBHOOK_RATE_LIMIT,
      1,
      1_000,
    ),
    rateWindowSeconds: boundedInteger(
      env.RELAYOPS_WEBHOOK_RATE_WINDOW_SECONDS,
      DEFAULT_WEBHOOK_RATE_WINDOW_SECONDS,
      1,
      3_600,
    ),
    replayWindowSeconds: boundedInteger(
      env.RELAYOPS_WEBHOOK_REPLAY_WINDOW_SECONDS,
      DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS,
      30,
      3_600,
    ),
  };
}

export function resolveWebhookRequestId(header: string | undefined) {
  return header && /^[A-Za-z\d._:-]{1,128}$/.test(header)
    ? header
    : randomUUID();
}

export function assertWebhookJsonContentType(contentType: string | undefined) {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new WebhookRequestError(
      415,
      "unsupported_content_type",
      "Content-Type must be application/json",
    );
  }
}

export async function readBoundedWebhookBody(
  request: Request,
  maximumBytes: number,
) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maximumBytes
    ) {
      throw new WebhookRequestError(
        413,
        "body_too_large",
        "Webhook body exceeds the configured limit",
      );
    }
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("body limit exceeded");
        throw new WebhookRequestError(
          413,
          "body_too_large",
          "Webhook body exceeds the configured limit",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function validateWebhookTimestamp(
  value: string | undefined,
  now: Date,
  replayWindowSeconds: number,
) {
  if (!value || !/^\d{10}$/.test(value)) {
    throw new WebhookRequestError(
      400,
      "invalid_timestamp",
      "Webhook timestamp is invalid",
    );
  }
  const timestampSeconds = Number(value);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (Math.abs(nowSeconds - timestampSeconds) > replayWindowSeconds) {
    throw new WebhookRequestError(
      400,
      "stale_timestamp",
      "Webhook timestamp is outside the replay window",
    );
  }
  return value;
}
