// Settings › Backups & export › Download for your bookkeeper (plan 7.12): the three CSV sheets of one month, built from
// src/shared/bookkeeping.ts. Pure, tested. Money to the cent with a dot ("12.50"), in the shop's currency.
import {
  bookkeepingOrderLines, bookkeepingPayouts, dailyBookkeeping, taxNamesOf,
  type BookkeepingOptions, type BookkeepingOrder,
} from "../../shared/bookkeeping";

const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

function cell(v: unknown) {
  const text = String(v ?? "");
  // A spreadsheet must never read a name or id as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
const csv = (rows: unknown[][]) => rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";

/** Sheet 1: one line per day. */
export function bookkeepingDaysCsv(orders: BookkeepingOrder[], options: BookkeepingOptions): string {
  const days = dailyBookkeeping(orders, options);
  const taxes = taxNamesOf(days);
  return csv([
    ["Date", "Sales before tax", "Shipping", "Discounts", "Gift cards sold", "Gift cards used", "Refunds", ...taxes, "Card fees", "Net", "Currency"],
    ...days.map((d) => [d.date, money(d.salesCents), money(d.shippingCents), money(d.discountsCents), money(d.giftCardsSoldCents),
      money(d.giftCardsUsedCents), money(d.refundsCents), ...taxes.map((t) => money(d.taxes[t] || 0)), money(d.feesCents), money(d.netCents), d.currency]),
  ]);
}

/** Sheet 2: one line per sale or refund of an order. */
export function bookkeepingOrdersCsv(orders: BookkeepingOrder[], options: BookkeepingOptions): string {
  const lines = bookkeepingOrderLines(orders, options);
  const taxes = taxNamesOf(lines);
  return csv([
    ["Date", "Order", "Type", "Sales before tax", "Shipping", "Discounts", "Gift cards sold", "Gift cards used", "Refunds", ...taxes,
      "Total charged", "Card fee", "Net", "Payout", "Payout date", "Currency"],
    ...lines.map((l) => [l.date, l.orderId, l.kind, money(l.salesCents), money(l.shippingCents), money(l.discountsCents), money(l.giftCardsSoldCents),
      money(l.giftCardsUsedCents), money(l.refundsCents), ...taxes.map((t) => money(l.taxes[t] || 0)),
      money(l.totalCents), money(l.feeCents), money(l.netCents), l.payoutId || "", l.payoutDate || "", l.currency]),
  ]);
}

/** Sheet 3: one line per payout. */
export function bookkeepingPayoutsCsv(orders: BookkeepingOrder[], options: BookkeepingOptions): string {
  return csv([
    ["Payout", "Date", "Orders", "Orders total", "Card fees", "Refunds", "Net", "Currency"],
    ...bookkeepingPayouts(orders, options).map((p) => [p.payoutId, p.date, p.orders, money(p.totalCents), money(p.feesCents), money(p.refundsCents), money(p.netCents), p.currency]),
  ]);
}

/** The months to choose from, newest first: this month, then the `count - 1` before it. */
export function bookkeepingMonths(now: Date, count = 13): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let back = 0; back < count; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-CA", { month: "long", year: "numeric" }) });
  }
  return out;
}
