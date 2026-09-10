import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  createCheckoutSession,
  createCustomerPortalLink,
  updateSubscriptionSeats,
} from "../../../apps/api/src/billing/creem-client";
import { constructWebhookEvent } from "../../../apps/api/src/billing/verify-webhook";
import { safeOutboundFetch } from "../../../apps/api/src/utils/safe-outbound-fetch";

vi.mock("../../../apps/api/src/utils/safe-outbound-fetch", () => ({
  safeOutboundFetch: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("preserves checkout, seats and portal REST contracts", async () => {
  vi.stubEnv("CREEM_API_KEY", "test-key");
  vi.stubEnv("CREEM_TEST_MODE", "true");
  vi.mocked(safeOutboundFetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({ checkout_url: "https://creem.io/checkout/test" }),
    ),
  );
  await expect(
    createCheckoutSession({
      productId: "prod",
      units: 2,
      successUrl: "https://example.test",
      requestId: "request",
      customerEmail: "test@example.test",
      metadata: { workspaceId: "w" },
    }),
  ).resolves.toEqual({ checkoutUrl: "https://creem.io/checkout/test" });
  expect(safeOutboundFetch).toHaveBeenLastCalledWith(
    "https://test-api.creem.io/v1/checkouts",
    expect.objectContaining({
      maxRedirects: 0,
      body: JSON.stringify({
        product_id: "prod",
        units: 2,
        success_url: "https://example.test",
        request_id: "request",
        customer: { email: "test@example.test" },
        metadata: { workspaceId: "w" },
      }),
    }),
  );
  vi.mocked(safeOutboundFetch).mockResolvedValueOnce(new Response("{}"));
  await expect(
    updateSubscriptionSeats({
      subscriptionId: "sub",
      productId: "prod",
      units: 3,
    }),
  ).resolves.toEqual({ ok: true });
  vi.mocked(safeOutboundFetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({ customer_portal_link: "https://creem.io/portal/test" }),
    ),
  );
  await expect(createCustomerPortalLink("customer")).resolves.toEqual({
    portalUrl: "https://creem.io/portal/test",
  });
});
it("fails closed on provider errors", async () => {
  vi.stubEnv("CREEM_API_KEY", "test-key");
  vi.mocked(safeOutboundFetch).mockResolvedValue(
    new Response("private provider error", { status: 500 }),
  );
  await expect(createCustomerPortalLink("customer")).rejects.toThrow(
    "Billing provider request failed",
  );
});
const body = JSON.stringify({
  id: "event_1",
  eventType: "subscription.active",
  object: { id: "sub_1" },
});
it("authenticates the exact legacy body and rejects tampering", () => {
  const signature = createHmac("sha256", "secret").update(body).digest("hex");
  expect(
    constructWebhookEvent(body, { "creem-signature": signature }, "secret"),
  ).toEqual({
    id: "event_1",
    type: "subscription.active",
    data: { id: "sub_1" },
  });
  expect(() =>
    constructWebhookEvent(
      body + " ",
      { "creem-signature": signature },
      "secret",
    ),
  ).toThrow();
  expect(() => constructWebhookEvent(body, {}, "")).toThrow();
});
it("checks standard timestamps and never falls back after invalid standard headers", () => {
  const key = Buffer.alloc(32, 7);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", key)
    .update(`id.${timestamp}.${body}`)
    .digest("base64");
  const headers = {
    "webhook-id": "id",
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
  expect(
    constructWebhookEvent(body, headers, `whsec_${key.toString("base64")}`).id,
  ).toBe("event_1");
  expect(() =>
    constructWebhookEvent(
      body,
      { ...headers, "webhook-timestamp": "1" },
      key.toString("base64"),
    ),
  ).toThrow();
});
