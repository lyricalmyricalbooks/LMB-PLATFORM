import { restoredUser } from "../../lib/authSession";
import { functionFetch } from "./functionsBase";

/**
 * Asks the server to price this order at wholesale when the signed-in shopper is an approved trade account (plan 12.10).
 * The server decides and does the pricing; a shopper who isn't one, or isn't signed in, gets no change. Never throws.
 */
export async function claimTradePricing(orderId: string, key?: string): Promise<boolean> {
  try {
    const user = await restoredUser().catch(() => null);
    if (!user?.email) return false;
    const token = await user.getIdToken();
    const res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(key ? { "X-Order-Key": key } : {}) },
      body: JSON.stringify({ action: "stockistPricing", orderId }),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return data?.wholesale === true;
  } catch { return false; }
}
