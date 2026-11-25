// The shop's first real order on Home (sign-up to open shop plan, move 5): which order to celebrate, if any.
// "Real" is the Overview's sales rule (paid, not a practice order) plus the server's first-sale email rule
// (functions/firstOrder.js): not a sandbox payment and not a past order brought over from another shop.

import { isRealPaidOrder, type Order } from "./overviewInsights";

/** Past this many real orders the shop is well under way: Home no longer offers the first-order card. */
export const FIRST_ORDER_WINDOW = 3;

export const isFirstOrderCandidate = (o: Order) => !!o && isRealPaidOrder(o) && !o.sandboxPayment && o.source !== "import";

const when = (o: Order) => {
  const t = Date.parse(String(o.paidAt || o.createdAt || ""));
  return Number.isNaN(t) ? Infinity : t;
};

/**
 * The first real order, while the shop has only a few and the owner hasn't put the card away (`done`). Null when there
 * is nothing to celebrate, or while the orders are still loading.
 */
export function firstOrderToCelebrate(orders: Order[] | null | undefined, done?: string | null): Order | null {
  if (!orders || done) return null;
  const real = orders.filter(isFirstOrderCandidate);
  if (!real.length || real.length > FIRST_ORDER_WINDOW) return null;
  return [...real].sort((a, b) => when(a) - when(b))[0];
}
