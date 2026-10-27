// How many copies one shopper can have set aside at checkout. The server enforces it
// (functions/stockHolds.js HOLD_LIMITS / holdLimitsFrom, read from settings/website.stockHolds); this
// mirror only lets the bag warn before the shopper has typed their card (holdLimits.parity.test.ts).
import { bundleComponents } from "./promotions";

export type HoldLimits = { perBook: number; units: number; orders: number };

export const DEFAULT_HOLD_LIMITS: HoldLimits = { perBook: 10, units: 50, orders: 3 };

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** The per-shopper caps from Settings › General › Checkout stock holds (today's numbers when unset). */
export function holdLimitsFrom(settings: any): HoldLimits {
  const saved = settings?.stockHolds || {};
  return {
    perBook: clampInt(saved.perBook, DEFAULT_HOLD_LIMITS.perBook, 1, 99),
    units: clampInt(saved.units, DEFAULT_HOLD_LIMITS.units, 1, 2000),
    orders: clampInt(saved.orders, DEFAULT_HOLD_LIMITS.orders, 1, 50),
  };
}

export type HoldWarning =
  | { kind: "perBook"; id: string; title: string; count: number; limit: number }
  | { kind: "units"; count: number; limit: number };

/**
 * Lines in the bag that the server will refuse at Pay. Only books whose stock is actually held count
 * (tracked inventory, no backorders), and a box set counts as the books inside it, as on the server.
 */
export function holdWarnings(
  cart: Array<{ id: string; quantity: number }>,
  booksById: { get(id: string): any },
  limits: HoldLimits = DEFAULT_HOLD_LIMITS,
): HoldWarning[] {
  const perBook = new Map<string, number>();
  const add = (id: string, qty: number) => perBook.set(id, (perBook.get(id) || 0) + qty);
  for (const line of cart || []) {
    if (!line?.id) continue;
    const qty = Math.max(1, Math.min(99, Math.floor(Number(line.quantity) || 1)));
    const parts = bundleComponents(booksById.get(line.id));
    if (parts.length) parts.forEach(part => add(part.id, qty * part.quantity));
    else add(line.id, qty);
  }
  const out: HoldWarning[] = [];
  let units = 0;
  for (const [id, count] of perBook) {
    const book = booksById.get(id);
    if (!book || !book.trackInventory || book.allowBackorder) continue;
    units += count;
    if (count > limits.perBook) out.push({ kind: "perBook", id, title: String(book.title || ""), count, limit: limits.perBook });
  }
  if (units > limits.units) out.push({ kind: "units", count: units, limit: limits.units });
  return out;
}
