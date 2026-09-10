import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

function equalDigest(expected: Buffer, received: Buffer) {
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

// Creem HMAC and Standard Webhooks contracts, documented in RELEASE_PREFLIGHT.md.
export function constructWebhookEvent(
  body: string,
  inputHeaders: Record<string, string>,
  secret: string,
) {
  if (!secret) throw new Error("Missing billing webhook secret");
  const headers = new Headers(inputHeaders);
  if (
    ["webhook-id", "webhook-timestamp", "webhook-signature"].some((name) =>
      headers.has(name),
    )
  ) {
    const id = headers.get("webhook-id");
    const time = headers.get("webhook-timestamp") ?? "";
    const signatures = headers.get("webhook-signature") ?? "";
    if (
      !id ||
      !/^\d+$/.test(time) ||
      Math.abs(Date.now() / 1000 - Number(time)) > 300
    )
      throw new Error("Invalid webhook timestamp or id");
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    if (!key.length) throw new Error("Invalid webhook key");
    const digest = createHmac("sha256", key)
      .update(`${id}.${time}.${body}`)
      .digest();
    const valid = signatures.split(/\s+/).some((signature) => {
      const [version, encoded] = signature.split(",");
      return (
        version === "v1" &&
        typeof encoded === "string" &&
        equalDigest(digest, Buffer.from(encoded, "base64"))
      );
    });
    if (!valid) throw new Error("Invalid webhook signature");
  } else {
    const signature = (
      headers.get("creem-signature") ??
      headers.get("x-creem-signature") ??
      ""
    ).replace(/^sha256=/, "");
    const digest = createHmac("sha256", secret).update(body).digest();
    if (
      !/^[a-f\d]{64}$/i.test(signature) ||
      !equalDigest(digest, Buffer.from(signature, "hex"))
    )
      throw new Error("Invalid webhook signature");
  }
  const raw = z
    .object({
      id: z.string().min(1),
      type: z.string().min(1).optional(),
      eventType: z.string().min(1).optional(),
      data: z.record(z.string(), z.unknown()).optional(),
      object: z.record(z.string(), z.unknown()).optional(),
    })
    .parse(JSON.parse(body));
  const type = raw.type ?? raw.eventType;
  const data = raw.data ?? raw.object;
  if (!type || !data) throw new Error("Invalid webhook event");
  return { id: raw.id, type, data };
}
