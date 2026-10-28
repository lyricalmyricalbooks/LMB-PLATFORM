// The card payment company's name and dashboard in the admin's words (code plan 5.2). A Square shop never reads
// "Stripe": order history, order detail, refunds, the payments panel, Ready to sell and help text all name the shop's
// own provider through `providerName()` (src/lib/shopProfile.ts, from the shop profile's `payments`).
import { paysOnSquare, providerName } from "../../lib/shopProfile";

export { providerName };

/**
 * Where the press looks at a card payment in their provider's own dashboard. Stripe: the payment (or dispute) itself.
 * Square: the Dashboard's list of sales (production or Sandbox), because the shop keeps Square's payment id, not the
 * id of Square's transaction page.
 */
export function providerDashboardUrl(order: { stripeMode?: string } | null | undefined, stripePath: string): string {
  const test = order?.stripeMode === "test";
  if (paysOnSquare()) return `https://${test ? "squareupsandbox.com" : "squareup.com"}/dashboard/sales/transactions`;
  return `https://dashboard.stripe.com/${test ? "test/" : ""}${stripePath}`;
}
