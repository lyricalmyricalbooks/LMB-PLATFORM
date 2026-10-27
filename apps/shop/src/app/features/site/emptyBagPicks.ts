// Style › Cart drawer › Empty bag › Suggest books in an empty bag (off by default). Which books an empty
// bag offers: featured books first, then the newest, a few at most. Pure, so it can be tested without a browser.
import { bookDateMs } from "./merchandising";

export const EMPTY_PICKS_DEFAULT = 3;
export const EMPTY_PICKS_MAX = 4;

/** True when the owner switched the suggestions on. */
export const emptyBagPicksOn = (design: any): boolean => design?.cartDrawerEmptyPicks === true;

/** How many books to offer (1–4, default 3). */
export function emptyBagPicksCount(design: any): number {
  const n = Math.round(Number(design?.cartDrawerEmptyPicksCount));
  if (!Number.isFinite(n) || n < 1) return EMPTY_PICKS_DEFAULT;
  return Math.min(EMPTY_PICKS_MAX, n);
}

const featured = (book: any) => (book?.isFeatured ?? book?.featured) === true;

/**
 * Up to `count` books from `candidates` (books that can be added right now): featured first, newest first
 * inside each group, ties by id so the pick never depends on the order the catalog loaded in.
 */
export function emptyBagPicks<T extends { id: string }>(candidates: T[], count: number): T[] {
  return candidates
    .slice()
    .sort((a, b) =>
      Number(featured(b)) - Number(featured(a))
      || bookDateMs(b) - bookDateMs(a)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, Math.max(0, count));
}
