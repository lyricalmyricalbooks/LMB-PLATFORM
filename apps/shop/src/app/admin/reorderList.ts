// Stock › Reorder list, in the combined admin only (`#reorder`, ReorderList.tsx): every product about to run out, most
// urgent first, with how many sold lately and a rough number to order. Read-only. On hand is the stockroom's own count
// (`deriveOnHand`) for a product the stockroom keeps; a product only the website keeps uses its website stock.
import { deriveOnHand } from "@stockroom/inventory.js";

import { buildInventory, soldLast30 } from "./inventoryInsights";
import type { StockroomRecords } from "./stockroom/stockroomData";

const DAY = 86_400_000;
/** Weeks of sales a reorder should cover, on top of the low-stock line. */
export const COVER_WEEKS = 12;
/** A product selling fast enough to run out within this many weeks is listed even above its low-stock line. */
export const SOON_WEEKS = 8;

export type ReorderRow = {
  key: string; title: string; source: "stockroom" | "website";
  onHand: number; threshold: number; sold30: number; soldLastMonth: number;
  /** Rough weeks until it runs out at the recent pace (null: no recent sales to tell). */
  weeksLeft: number | null; suggested: number;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const norm = (s: unknown) => String(s || "").trim().toLowerCase();
const timeOf = (v: any) => { const t = v?.toDate ? v.toDate().getTime() : new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };

/** The calendar month before `now`: its first moment, the first moment of this month, and its length in days. */
export function lastMonth(now: number) {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return { start, end, days: Math.round((end - start) / DAY) };
}

/** Units of one stockroom item sold from `from` (a day key) up to `to`: its sales, and stockists' reported sales. */
function stockroomSold(state: Record<string, unknown>, from: string, to: string) {
  let n = 0;
  const inRange = (date: unknown) => { const d = String(date || "").slice(0, 10); return !!d && d >= from && d < to; };
  for (const h of (Array.isArray(state.hist) ? state.hist : []) as Array<Record<string, unknown>>) {
    if (h && !h.voided && inRange(h.date)) n += Math.max(0, num(h.qty));
  }
  for (const e of (Array.isArray(state.ledger) ? state.ledger : []) as Array<Record<string, unknown>>) {
    if (e && e.type === "Sale" && !e.voided && inRange(e.date)) n += Math.max(0, num(e.qty));
  }
  return n;
}

/** Pace, weeks left and a suggested order for one product; null when it isn't running out. */
export function plan(onHand: number, threshold: number, sold30: number, soldLastMonth: number, monthDays: number) {
  const perDay = sold30 > 0 ? sold30 / 30 : soldLastMonth > 0 ? soldLastMonth / monthDays : 0;
  const weeksLeft = perDay > 0 ? Math.max(0, onHand) / (perDay * 7) : null;
  if (onHand > threshold && !(weeksLeft !== null && weeksLeft <= SOON_WEEKS)) return null;
  const target = Math.max(Math.ceil(perDay * 7 * COVER_WEEKS) + threshold, threshold * 2, 1);
  return { weeksLeft, suggested: Math.max(0, target - Math.max(0, onHand)) };
}

/** Most urgent first: nothing left, then fewest weeks left, then furthest under the low-stock line. */
export function byUrgency(a: ReorderRow, b: ReorderRow) {
  const out = (r: ReorderRow) => (r.onHand <= 0 ? 0 : 1);
  if (out(a) !== out(b)) return out(a) - out(b);
  const wa = a.weeksLeft ?? Infinity, wb = b.weeksLeft ?? Infinity;
  if (wa !== wb) return wa - wb;
  return a.onHand - a.threshold - (b.onHand - b.threshold) || a.title.localeCompare(b.title);
}

export function buildReorder(input: { stockroom: StockroomRecords | null; shopBooks: any[]; paidOrders: any[]; shopThreshold: number; now?: number }): ReorderRow[] {
  const now = input.now ?? Date.now();
  const month = lastMonth(now);
  const rows: ReorderRow[] = [];
  const kept = new Set<string>();
  const from30 = dayKey(now - 30 * DAY), tomorrow = dayKey(now + DAY), mFrom = dayKey(month.start), mTo = dayKey(month.end);
  for (const book of input.stockroom?.books || []) {
    const state: Record<string, unknown> = { hist: [], ledger: [], stores: [], ...(input.stockroom?.states[book.id] || {}) };
    if (state.stock === undefined && book.maxPrint !== undefined) state.stock = book.maxPrint;
    const onHand = Number.isFinite(book.maxPrint) ? deriveOnHand(state, book) : num(state.stock);
    const threshold = book.threshold !== undefined && Number.isFinite(Number(book.threshold)) ? num(book.threshold) : input.shopThreshold;
    const sold30 = stockroomSold(state, from30, tomorrow), soldM = stockroomSold(state, mFrom, mTo);
    kept.add(norm(book.title)); kept.add(norm(book.id));
    const p = plan(onHand, threshold, sold30, soldM, month.days);
    if (p) rows.push({ key: `s:${book.id}`, title: String(book.title || book.id), source: "stockroom", onHand, threshold, sold30, soldLastMonth: soldM, ...p });
  }
  // Products only the website keeps (not in the stockroom): website stock and paid website orders.
  const inMonth = (input.paidOrders || []).filter((o) => { const t = timeOf(o?.createdAt); return t >= month.start && t < month.end; });
  const monthSold = soldLast30(inMonth, month.start + 30 * DAY);
  for (const r of buildInventory(input.shopBooks || [], input.paidOrders || [], input.shopThreshold, now)) {
    if (r.kind !== "stock" || r.archived || r.backorder) continue;
    if (kept.has(norm(r.bookId)) || kept.has(norm(r.title))) continue;
    const soldM = monthSold.get(r.id) || 0;
    const p = plan(r.stock, input.shopThreshold, r.sold30, soldM, month.days);
    const title = r.edition ? `${r.title} — ${r.edition}` : r.title;
    if (p) rows.push({ key: `w:${r.id}`, title, source: "website", onHand: r.stock, threshold: input.shopThreshold, sold30: r.sold30, soldLastMonth: soldM, ...p });
  }
  return rows.sort(byUrgency);
}

export const weeksText = (w: number | null) => (w === null ? "—" : w < 1 ? "Under 1" : w >= 52 ? "52+" : String(Math.floor(w)));

/** The list as a CSV table (saveTable turns it into Excel too). */
export function reorderCsv(rows: ReorderRow[], words: (s: string) => string = (s) => s): string {
  const cell = (v: unknown) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [words("Book"), "On hand", "Low-stock line", "Sold last 30 days", "Sold last month", "Weeks left", "Suggested order"];
  return [head, ...rows.map((r) => [r.title, r.onHand, r.threshold, r.sold30, r.soldLastMonth, weeksText(r.weeksLeft), r.suggested])].map((row) => row.map(cell).join(",")).join("\n");
}
