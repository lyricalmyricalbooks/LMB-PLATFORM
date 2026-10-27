// Pre-orders: a published book the shop sells before its publication date. One copy for the shop and the server:
// the storefront imports this file (features/site/preorder.ts), and the Functions run functions/shared/preorder.js,
// which scripts/build-shared.mjs writes from it (src/shared/CLAUDE.md).
//
// On while Books › edit › Inventory › "Take pre-orders" is on and the Publication date
// (`publishDate`, YYYY-MM-DD) is still ahead in the shop's (Toronto) calendar. No date =
// "release date to be announced" until the switch is turned off. On the release day it becomes an
// ordinary book by itself. Stock and prices are the book's normal ones; only the wording, the order's
// shipping timing and e-book access change.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Today in the shop's calendar, same as the server's shopDate (functions/paymentGuards.js). */
export function shopDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function releaseDateOf(book: any): string {
  const value = String(book?.publishDate || "").slice(0, 10);
  return DATE_ONLY.test(value) ? value : "";
}

export function preorderActive(book: any, now: Date = new Date()): boolean {
  if (!book || book.preorder !== true) return false;
  const date = releaseDateOf(book);
  return !date || date > shopDate(now);
}

/**
 * The fields every server-built order line carries. Always set, so a browser-sent `preorder`
 * flag on a line can never stick.
 */
export function preorderLine(book: any, now: Date = new Date()): { preorder: boolean; releaseDate: string | null } {
  const active = preorderActive(book, now);
  return { preorder: active, releaseDate: active ? (releaseDateOf(book) || null) : null };
}

/** A download (e-book, PDF, audiobook): never shipped, so it never holds a parcel back. */
export const isDigitalLine = (item: any): boolean => !!item && (item.digital === true || item.isDigital === true || /digital|e-book|ebook|epub|pdf|audiobook/.test(String(item.format || "").toLowerCase()));

/** Physical pre-order lines that still hold the parcel back (none once released by date or by the publisher). */
export function waitingPreorderLines(order: any, operations: any = {}, now: Date = new Date()): any[] {
  if (!order || order.preorderReleasedAt || operations?.preorderReleased) return [];
  const today = shopDate(now);
  return (order.items || []).filter((item: any) => item && item.preorder === true && !isDigitalLine(item) && (!item.releaseDate || String(item.releaseDate) > today));
}

/** Latest release date of the waiting lines, or "" when any of them has no date yet. */
export function shipDateOf(lines: any[]): string {
  if (!lines.length || lines.some((item) => !item.releaseDate)) return "";
  return lines.map((item) => String(item.releaseDate)).sort().pop() || "";
}

/** When the parcel could first ship because of its pre-orders (ms): early release, else latest physical release day. 0 = none. */
export function preorderClockStart(order: any, operations: any = {}): number {
  const physical = (order?.items || []).filter((item: any) => item && item.preorder === true && !isDigitalLine(item));
  if (!physical.length) return 0;
  const early = Date.parse(order?.preorderReleasedAt || operations?.preorderReleasedAt || "");
  if (Number.isFinite(early)) return early;
  const dated = physical.filter((item: any) => item.releaseDate).map((item: any) => String(item.releaseDate)).sort().pop();
  return dated ? Date.parse(`${dated}T12:00:00Z`) || 0 : 0;
}

/** Plain-text lines for order emails (customer and shop). [] for orders with no pre-orders. */
export function preorderEmailLines(order: any, now: Date = new Date()): string[] {
  const lines = (order?.items || []).filter((item: any) => item && item.preorder === true);
  if (!lines.length) return [];
  const out: string[] = lines.map((item: any) => `${item.title || "A book"}${item.variantName ? ` (${item.variantName})` : ""}: ${item.releaseDate ? `releases ${item.releaseDate}` : "release date to be announced"}.`);
  const waiting = waitingPreorderLines(order, {}, now);
  if (waiting.length) {
    const date = shipDateOf(waiting);
    out.push(date ? `Your parcel ships when the last pre-order is released (${date}).` : "Your parcel ships once the release date is announced and the book is out.");
  }
  if (lines.some(isDigitalLine)) out.push("Digital pre-orders can be downloaded from the release date.");
  return out;
}

/**
 * The publisher changed a book's pre-order switch or Publication date: the new release date for
 * that book's pre-order lines on a paid, not-yet-sent order, or null when nothing changes. Lines keep
 * `preorder: true` (emails and ship-late clocks still know they were pre-orders); a book that is no
 * longer on pre-order gets a release date of today at the latest, so the order is released.
 */
export function restampPreorderItems(order: any, bookId: string, book: any, now: Date = new Date()): any[] | null {
  if (!order || order.paymentStatus !== "paid" || order.status === "cancelled") return null;
  if (["shipped", "out_for_delivery", "delivered", "collected", "cancelled", "refunded"].includes(order.fulfillmentStatus)) return null;
  const today = shopDate(now);
  const date = releaseDateOf(book);
  const next = preorderActive(book, now) ? (date || null) : (date && date <= today ? date : today);
  let changed = false;
  const items = (order.items || []).map((item: any) => {
    if (!item || item.id !== bookId || item.preorder !== true || (item.releaseDate || null) === next) return item;
    changed = true;
    return { ...item, releaseDate: next };
  });
  return changed ? items : null;
}

/** "12 Nov 2026" in the shopper's language; the date is a calendar day, so it is read as UTC. */
export function formatReleaseDate(date: string, locale?: string): string {
  if (!DATE_ONLY.test(String(date || ""))) return "";
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
}

/** A bag line saved as a pre-order whose release day hasn't come yet (bags can sit for days). */
export function linePreorderOpen(line: { preorder?: boolean; releaseDate?: string | null } | null | undefined, now: Date = new Date()): boolean {
  return !!line?.preorder && (!line.releaseDate || String(line.releaseDate) > shopDate(now));
}

/** Cart/checkout: the open pre-order lines in a bag, with the date the whole parcel can ship ("" = not announced). */
export function bagPreorder(lines: { preorder?: boolean; releaseDate?: string | null }[], now: Date = new Date()): { count: number; shipDate: string } {
  const pre = (lines || []).filter((l) => linePreorderOpen(l, now));
  return { count: pre.length, shipDate: shipDateOf(pre) };
}

/** The shopper-facing note for one bag/checkout line, or "" (copy keys cartPreorder / cartPreorderTba). */
export function linePreorderNote(line: { preorder?: boolean; releaseDate?: string | null }, copy: (key: string, vars?: Record<string, string>) => string, now: Date = new Date()): string {
  if (!linePreorderOpen(line, now)) return "";
  return line.releaseDate ? copy("cartPreorder", { date: formatReleaseDate(String(line.releaseDate)) }) : copy("cartPreorderTba");
}
