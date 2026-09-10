export type SafeWebhookAudit = {
  event: "relayops.signal_ingestion";
  requestId: string;
  sourceId: string;
  payloadHash: string | null;
  bodySize: number;
  outcome: "accepted" | "deduplicated" | "rejected" | "rate_limited";
  errorCode: string | null;
};

export function webhookAuditMetadata(
  input: Omit<SafeWebhookAudit, "event">,
): SafeWebhookAudit {
  return { event: "relayops.signal_ingestion", ...input };
}

export function emitWebhookAudit(input: Omit<SafeWebhookAudit, "event">) {
  // This deliberately accepts only the safe allowlist above. Never pass an
  // Error object, headers, body, source name, or decrypted secret to logging.
  console.info(JSON.stringify(webhookAuditMetadata(input)));
}
