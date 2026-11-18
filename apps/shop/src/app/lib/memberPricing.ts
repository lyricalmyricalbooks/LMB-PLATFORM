import { restoredUser } from "../../lib/authSession";
import { functionFetch } from "./functionsBase";

/**
 * Asks the server for member prices on this order when the signed-in shopper has a membership whose plan takes a percent
 * off (Memberships M2a). The server decides and prices; a shopper who isn't a member, or isn't signed in, gets no change.
 * Never throws.
 */
export async function claimMemberPricing(orderId: string, key?: string): Promise<boolean> {
  try {
    const user = await restoredUser().catch(() => null);
    if (!user?.email) return false;
    const token = await user.getIdToken();
    const res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(key ? { "X-Order-Key": key } : {}) },
      body: JSON.stringify({ action: "membershipPricing", orderId }),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return data?.member === true;
  } catch { return false; }
}
