import { safeOutboundFetch } from "../utils/safe-outbound-fetch";
import { creemApiBaseUrl, creemApiKey } from "./config";

// Documented REST contract; no code from the creem SDK is distributed.
export async function providerRequest(
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const key = creemApiKey();
  if (!key) throw new Error("Billing credentials are not configured");
  const response = await safeOutboundFetch(`${creemApiBaseUrl()}/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
    maxRedirects: 0,
    timeoutMs: 10_000,
    maxResponseBytes: 262_144,
  });
  if (!response.ok)
    throw new Error(`Billing provider returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid billing response");
  return value as Record<string, unknown>;
}
export function providerUrl(value: unknown): string {
  if (typeof value !== "string" || new URL(value).protocol !== "https:")
    throw new Error("Invalid billing redirect URL");
  return value;
}
