// Orders › Export CSV: the bookkeeping columns from orderApi.exportToCsv plus the newer order
// details — automatic discount titles, gift card payments, gift cards sold, add-ons and box sets.
// Pure, tested. Rows line up with exportToCsv's because the same orders are kept, in order.
import { orderApi } from "../lib/commerce";
import { discountLabel, giftCardPaid, issuedGiftCards, lineDetailsSummary } from "./orderLines";

export const EXTRA_HEADERS = ["DiscountLabel", "GiftCardPaid", "GiftCardsUsed", "GiftCardsSold", "LineExtras"];

const keptOrders = (orders: any[], paidOnly: boolean) => orders.filter((o) => o.isTest !== true
  && (!paidOnly || ["paid", "refunded", "refund_pending"].includes(o.paymentStatus)));

function cell(v: any) {
  const text = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Splits CSV text into records, respecting quoted cells that contain newlines. */
export function csvRecords(csv: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') quoted = !quoted;
    else if (c === "\n" && !quoted) { out.push(csv.slice(start, i)); start = i + 1; }
  }
  out.push(csv.slice(start));
  return out;
}

export function extraCells(o: any): string[] {
  const used = (Array.isArray(o.giftCardRedemptions) ? o.giftCardRedemptions : []).map((r: any) => `••••${r.last4}`).join(" ");
  const sold = issuedGiftCards(o).map((c) => `••••${c.last4} ${((Number(c.minor) || 0) / 100).toFixed(2)}${c.recipientEmail ? ` to ${c.recipientEmail}` : ""}`).join("; ");
  return [discountLabel(o), giftCardPaid(o) > 0 ? giftCardPaid(o).toFixed(2) : "", used, sold, lineDetailsSummary(o)];
}

export function exportOrdersCsv(orders: any[], { paidOnly = true }: { paidOnly?: boolean } = {}): string {
  const base = orderApi.exportToCsv(orders, { paidOnly });
  const records = csvRecords(base);
  const kept = keptOrders(orders, paidOnly);
  // Should the shared export ever keep different rows, fall back to it unchanged rather than misalign.
  if (records.length !== kept.length + 1) return base;
  return records.map((record, i) => [record, ...(i === 0 ? EXTRA_HEADERS : extraCells(kept[i - 1])).map(cell)].join(",")).join("\n");
}
