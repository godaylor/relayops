import { createHmac } from "node:crypto";
import * as Sentry from "@sentry/node";
import { safeOutboundFetch } from "../../utils/safe-outbound-fetch";

type GenericWebhookPayload = Record<string, unknown>;

const GENERIC_WEBHOOK_TIMEOUT_MS = 10_000;

export async function postToGenericWebhook(
  webhookUrl: string,
  payload: GenericWebhookPayload,
  secret?: string,
): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (secret) {
    headers["X-Kaneo-Signature"] = createHmac("sha256", secret)
      .update(body)
      .digest("hex");
  }

  Sentry.addBreadcrumb({
    category: "integration",
    level: "info",
    data: { integration: "generic-webhook" },
  });
  const response = await safeOutboundFetch(webhookUrl, {
    method: "POST",
    headers,
    body,
    timeoutMs: GENERIC_WEBHOOK_TIMEOUT_MS,
    maxResponseBytes: 64 * 1024,
    label: "Generic webhook",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Generic webhook request failed (${response.status}): ${errorText}`,
    );
  }
}
