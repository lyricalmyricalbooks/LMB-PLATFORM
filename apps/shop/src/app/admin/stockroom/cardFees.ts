// Tax centre › Card fees: what the card provider kept from the year's paid website orders (each order's `fee`, saved by
// the server from the provider's own figures, functions/orderMoney.js), per currency, and one tap to log it as a
// "Sales Processing Fees" expense. The expense id is fixed per year and currency, so logging twice adds nothing.
import { orderDay } from "../../lib/shopDay";
import { addBusinessExpense } from "./taxExpense";

type Row = Record<string, any>;
export type FeeLine = { currency: string; feeMinor: number; platformMinor: number; orders: number };
export type CardFeeYear = { lines: FeeLine[]; missing: number };

const PAID = new Set(["paid", "refunded", "partially_refunded", "refund_pending"]);

/** The year's card fees from paid, real website orders. `missing`: paid card orders whose fee isn't known yet. Pure. */
export function cardFeesForYear(orders: Row[], year: string): CardFeeYear {
  const by = new Map<string, FeeLine>();
  let missing = 0;
  for (const o of orders || []) {
    if (!o || o.isTest || o.sandboxPayment || o.practiceOrder || o.source === "import") continue;
    if (!PAID.has(String(o.paymentStatus || ""))) continue;
    if (!orderDay(o.paidAt || o.createdAt).startsWith(`${year}-`)) continue;
    const fee = Number(o.fee);
    if (!Number.isFinite(fee)) { if (o.stripePaymentIntentId || o.stripeCheckoutSessionId) missing += 1; continue; }
    const currency = String(o.expectedCurrency || o.currency || "CAD").toUpperCase();
    const line = by.get(currency) || { currency, feeMinor: 0, platformMinor: 0, orders: 0 };
    line.feeMinor += Math.round(fee);
    line.platformMinor += Math.round(Number(o.platformFee) || 0);
    line.orders += 1;
    by.set(currency, line);
  }
  return { lines: [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency)), missing };
}

/** The fixed expense id for one year's fees in one currency (a number, as the ledger's ids are). */
export const cardFeeExpenseId = (year: string, currency: string) =>
  Number(`9${year}${[...currency].map((c) => String(c.charCodeAt(0) - 55).padStart(2, "0")).join("")}`);

export const cardFeesLogged = (taxCenter: Row | null, year: string, currency: string) =>
  (Array.isArray(taxCenter?.businessExpenses) ? taxCenter!.businessExpenses : []).some((e: Row) => e?.id === cardFeeExpenseId(year, currency));

/** The save step: one expense for the year's fees in one currency, dated the year's last day (or today if sooner). */
export function logCardFeesChange(line: FeeLine, year: string, today: string) {
  const end = `${year}-12-31`;
  return (current: Row | null) => addBusinessExpense(current, {
    desc: `Card processing fees, ${year} (${line.orders} website order${line.orders === 1 ? "" : "s"})`,
    cat: "Sales Processing Fees", date: today < end ? today : end, amount: (line.feeMinor / 100).toFixed(2), currency: line.currency, trip: "", ref: `card-fees-${year}`,
  }, line.feeMinor / 100, cardFeeExpenseId(year, line.currency));
}
