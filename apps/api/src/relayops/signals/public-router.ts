import { HTTPException } from "hono/http-exception";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { emitWebhookAudit } from "./audit";
import {
  completeWebhookAttempt,
  createWebhookSignal,
  decryptSignalSourceSecret,
  getEnabledWebhookSource,
  reserveWebhookAttempt,
} from "./controllers";
import { verifyWebhookSignature, WebhookEncryptionError } from "./crypto";
import { SignalNormalizationError } from "./normalization";
import {
  assertWebhookJsonContentType,
  getWebhookLimits,
  readBoundedWebhookBody,
  resolveWebhookRequestId,
  validateWebhookTimestamp,
  WebhookRequestError,
} from "./request-guards";
import { webhookIngestionResultSchema, webhookSourceParam } from "./schema";

const webhookRoute = createRoute({
  method: "post",
  operationId: "ingestRelayOpsSignalWebhook",
  path: "/{sourceId}/signals",
  tags: ["RelayOps Signals"],
  summary: "Ingest a signed generic signal webhook",
  409: errorResponse("Webhook request ID was already used"),
  description:
    "Authenticates exact raw bytes with HMAC-SHA256. This public route does not use session authentication.",
  security: [],
  request: { params: webhookSourceParam },
  responses: {
    202: jsonResponse(
      "Signal accepted or deduplicated",
      webhookIngestionResultSchema,
    ),
    400: errorResponse("Malformed JSON or stale timestamp"),
    401: errorResponse("Invalid webhook signature"),
    404: errorResponse("Webhook source not found"),
    413: errorResponse("Webhook body is too large"),
    415: errorResponse("Unsupported content type"),
    422: errorResponse("Signal payload is invalid"),
    429: errorResponse("Webhook rate limit exceeded"),
    503: errorResponse("Webhook encryption is unavailable"),
  },
});

const publicSignalWebhookRouter = apiRouter<BaseVariables>().openapi(
  webhookRoute,
  async (c) => {
    const now = new Date();
    const sourceId = c.req.valid("param").sourceId;
    const requestId = resolveWebhookRequestId(c.req.header("x-request-id"));
    const limits = getWebhookLimits();
    const source = await getEnabledWebhookSource(sourceId);
    const reservation = await reserveWebhookAttempt({
      source,
      requestId,
      now,
      rateLimit: limits.rateLimit,
      rateWindowSeconds: limits.rateWindowSeconds,
    });
    if (reservation.limited) {
      emitWebhookAudit({
        requestId,
        sourceId,
        payloadHash: null,
        bodySize: 0,
        outcome: "rate_limited",
        errorCode: "rate_limited",
      });
      throw new HTTPException(429, { message: "Webhook rate limit exceeded" });
    }
    if (reservation.replayed) {
      emitWebhookAudit({
        requestId,
        sourceId,
        payloadHash: null,
        bodySize: 0,
        outcome: "rejected",
        errorCode: "request_replayed",
      });
      throw new HTTPException(409, {
        message: "Webhook request ID was already used",
      });
    }

    let rawBody: Uint8Array | undefined;
    const reject = async (error: WebhookRequestError) => {
      const safe = await completeWebhookAttempt({
        workspaceId: source.workspaceId,
        attemptId: reservation.attemptId,
        outcome: "rejected",
        errorCode: error.code,
        rawBody,
      });
      emitWebhookAudit({
        requestId,
        sourceId,
        ...safe,
        outcome: "rejected",
        errorCode: error.code,
      });
      throw new HTTPException(error.status, { message: error.message });
    };

    try {
      assertWebhookJsonContentType(c.req.header("content-type"));
      rawBody = await readBoundedWebhookBody(c.req.raw, limits.bodyLimitBytes);
      const timestamp = validateWebhookTimestamp(
        c.req.header("x-relayops-timestamp"),
        now,
        limits.replayWindowSeconds,
      );
      let secret: string;
      try {
        secret = decryptSignalSourceSecret(source);
      } catch (error) {
        if (error instanceof WebhookEncryptionError) {
          throw new WebhookRequestError(
            503,
            "encryption_unavailable",
            "Webhook encryption is unavailable",
          );
        }
        throw error;
      }
      if (
        !verifyWebhookSignature({
          secret,
          timestamp,
          rawBody,
          signature: c.req.header("x-relayops-signature"),
        })
      ) {
        throw new WebhookRequestError(
          401,
          "invalid_signature",
          "Invalid webhook signature",
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
      } catch {
        throw new WebhookRequestError(400, "malformed_json", "Malformed JSON");
      }
      let result: Awaited<ReturnType<typeof createWebhookSignal>>;
      try {
        result = await createWebhookSignal(source, payload);
      } catch (error) {
        if (error instanceof SignalNormalizationError) {
          throw new WebhookRequestError(422, error.code, error.message);
        }
        throw error;
      }

      const outcome = result.deduplicated ? "deduplicated" : "accepted";
      const safe = await completeWebhookAttempt({
        workspaceId: source.workspaceId,
        attemptId: reservation.attemptId,
        outcome,
        errorCode: null,
        rawBody,
      });
      emitWebhookAudit({
        requestId,
        sourceId,
        ...safe,
        outcome,
        errorCode: null,
      });
      return c.json(
        {
          accepted: true as const,
          deduplicated: result.deduplicated,
          signalId: result.signal.id,
        },
        202,
      );
    } catch (error) {
      if (error instanceof WebhookRequestError) return reject(error);
      const fallback = new WebhookRequestError(
        400,
        "ingestion_failed",
        "Webhook ingestion failed",
      );
      return reject(fallback);
    } finally {
      if (rawBody) rawBody.fill(0);
    }
  },
);

export default publicSignalWebhookRouter;
