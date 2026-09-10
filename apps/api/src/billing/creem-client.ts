import { HTTPException } from "hono/http-exception";
import { providerRequest, providerUrl } from "./provider-request";

export async function createCheckoutSession(input: {
  productId: string;
  units: number;
  successUrl: string;
  requestId: string;
  customerEmail: string;
  metadata: Record<string, string>;
}) {
  try {
    const result = await providerRequest("checkouts", {
      product_id: input.productId,
      units: input.units,
      success_url: input.successUrl,
      request_id: input.requestId,
      customer: { email: input.customerEmail },
      metadata: input.metadata,
    });
    return { checkoutUrl: providerUrl(result.checkout_url) };
  } catch {
    console.error("Billing checkout request failed");
    throw new HTTPException(502, {
      message: "Billing provider request failed",
    });
  }
}
export async function updateSubscriptionSeats(input: {
  subscriptionId: string;
  productId: string;
  units: number;
}) {
  try {
    await providerRequest(
      `subscriptions/${encodeURIComponent(input.subscriptionId)}`,
      {
        items: [{ product_id: input.productId, units: input.units }],
        update_behavior: "proration-charge",
      },
    );
    return { ok: true as const };
  } catch {
    console.error("Billing seat update failed");
    return { ok: false as const };
  }
}
export async function createCustomerPortalLink(customerId: string) {
  try {
    const result = await providerRequest("customers/billing", {
      customer_id: customerId,
    });
    return { portalUrl: providerUrl(result.customer_portal_link) };
  } catch {
    console.error("Billing portal request failed");
    throw new HTTPException(502, {
      message: "Billing provider request failed",
    });
  }
}
