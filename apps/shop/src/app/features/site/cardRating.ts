// "Star rating on shop cards" (Shopify themes' "Show product rating"), Studio › Style › Book cards in the shop grid ›
// showCardRating (off by default). Display only: approved reviews counted by Firestore, never invented.

export type CardRating = { stars: number; average: string; count: number };

/** What a shop card shows for a book's approved-review summary: stars rounded to the nearest half, the average to one
 *  decimal, and the count. Null (nothing drawn) for a book with no approved reviews or a summary that isn't a real
 *  1–5 average. */
export function cardRating(summary: { count?: unknown; average?: unknown } | null | undefined): CardRating | null {
  const count = Number(summary?.count);
  const average = Number(summary?.average);
  if (!Number.isFinite(count) || count < 1 || !Number.isFinite(average) || average < 1 || average > 5) return null;
  return { stars: Math.round(average * 2) / 2, average: (Math.round(average * 10) / 10).toFixed(1), count: Math.floor(count) };
}

/** Five star glyph states for `stars` (full / half / empty). */
export function starStates(stars: number): Array<"full" | "half" | "empty"> {
  return Array.from({ length: 5 }, (_, i) => (stars >= i + 1 ? "full" : stars >= i + 0.5 ? "half" : "empty"));
}
