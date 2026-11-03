// The lowest regular price of the 30 days before a sale (functions/priceHistory.js keeps the earlier prices). When the
// regular price was lower at some point in that time, the struck-through "was" price overstates the saving: the EU's
// price-indication rule and Canada's Competition Act both want the lower price named. The book page shows it then.
const DAY = 86400000;

/** The lower earlier price (in the book's own currency), or null when the struck-through price is already the lowest. */
export function lowestBeforeSale(book: any, now: Date = new Date()): number | null {
  const regular = Number(book?.price);
  if (!(regular > 0) || !Array.isArray(book?.priceHistory)) return null;
  const start = Date.parse(String(book?.saleStartsAt || "").slice(0, 10));
  const saleStart = Number.isFinite(start) && start < now.getTime() ? start : now.getTime();
  const earlier = book.priceHistory
    .filter((entry: any) => typeof entry?.price === "number" && entry.price > 0 && Date.parse(entry.until) >= saleStart - 30 * DAY)
    .map((entry: any) => entry.price as number);
  const lowest = Math.min(regular, ...earlier);
  return lowest < regular ? lowest : null;
}
