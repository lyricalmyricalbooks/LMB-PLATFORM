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

/** Net days the signed-in shopper has to pay an invoice (a trade account with terms), or null when they pay by card. Never throws. */
export async function tradeInvoiceTerms(): Promise<{ days: number; name: string } | null> {
  try {
    const user = await restoredUser().catch(() => null);
    if (!user?.email) return null;
    const token = await user.getIdToken();
    const res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "stockistStatus" }),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    const days = Math.floor(Number(data?.terms));
    return data?.wholesale === true && days > 0 ? { days: Math.min(days, 365), name: String(data.name || "").slice(0, 200) } : null;
  } catch { return null; }
}

/** The pretend payment method id the invoice option uses at checkout (never a real shop setting). */
export const INVOICE_METHOD_ID = "trade_invoice";

/** The Authorization header for a signed-in shopper, or nothing; the server decides who they are. */
export async function tradeAuthHeader(): Promise<Record<string, string>> {
  try {
    const user = await restoredUser().catch(() => null);
    return user?.email ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
  } catch { return {}; }
}
