// The publisher's own arrangement of the shop (Admin › Books › Sort: "Shop order"). Each book may carry a
// numeric `sortOrder`; arranged books come first in that order, the rest follow in their existing order.
// A shop where nothing has been arranged keeps exactly the order it had before. Pure.

/** The book's place in the arrangement, or null when it has none. */
export function shopRank(book: any): number | null {
  const raw = book?.sortOrder;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** True when at least one book has been arranged. */
export const hasShopOrder = (books: any[] | null | undefined) => (books || []).some((b) => shopRank(b) !== null);

/** Compare by arrangement only: arranged before unarranged, 0 for two unarranged books (caller breaks ties). */
export function compareShopOrder(a: any, b: any): number {
  const x = shopRank(a), y = shopRank(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

/** A stable copy of `books` in shop order; returns the same array when nothing is arranged. */
export function inShopOrder<T>(books: T[]): T[] {
  if (!hasShopOrder(books as any[])) return books;
  return books.map((book, index) => ({ book, index }))
    .sort((a, b) => compareShopOrder(a.book, b.book) || a.index - b.index)
    .map((x) => x.book);
}

/** Move one id within an ordered id list (clamped); returns a new list. */
export function moveId(ids: string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  return next;
}

/** The `sortOrder` writes that turn `books` into the order `ids` (only books whose number changes). */
export function shopOrderWrites(ids: string[], books: any[]): { id: string; sortOrder: number }[] {
  const byId = new Map(books.map((b) => [b.id, b]));
  const out: { id: string; sortOrder: number }[] = [];
  ids.forEach((id, i) => {
    const want = (i + 1) * 10;
    if (byId.has(id) && shopRank(byId.get(id)) !== want) out.push({ id, sortOrder: want });
  });
  return out;
}
