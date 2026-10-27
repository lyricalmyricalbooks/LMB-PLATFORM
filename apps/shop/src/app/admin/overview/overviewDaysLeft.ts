// "Running low" as days left: copies of each shelf row (a book or one edition) sold in the last 30 days, and how many
// days the shelf lasts at that pace. Pure; real paid orders only (the caller passes them).
import type { Order } from "./overviewInsights";
import type { StockRow } from "../stockRules";

const DAY = 86_400_000;
export const PACE_DAYS = 30;

const variantOf = (line: any): string | null => {
  const v = line?.variantId ?? line?.variant?.id ?? null;
  return v === null || v === undefined || v === "" ? null : String(v);
};

/** Copies of this row sold in the last 30 days. A row without an edition counts every line of its book with no edition. */
export function soldInWindow(paid: Order[], row: Pick<StockRow, "bookId" | "variantId">, now = Date.now(), days = PACE_DAYS): number {
  const from = now - days * DAY;
  let n = 0;
  for (const o of paid) {
    const t = Date.parse(o.createdAt ?? "");
    if (Number.isNaN(t) || t < from || t > now) continue;
    for (const line of o.items || []) {
      if (String(line?.id || "") !== row.bookId) continue;
      if (variantOf(line) !== (row.variantId || null)) continue;
      n += Number(line?.quantity) || 0;
    }
  }
  return n;
}

/** Days until the row sells out at the last 30 days' pace: 0 when none are left, null when nothing sold lately. */
export function daysLeft(stock: number, sold: number, days = PACE_DAYS): number | null {
  if (stock <= 0) return 0;
  if (sold <= 0) return null;
  return stock / (sold / days);
}
