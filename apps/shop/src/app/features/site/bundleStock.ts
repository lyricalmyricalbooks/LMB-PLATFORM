import { bundleAvailable, isBundle } from "./promotions";

/**
 * Box sets have no stock of their own: one set takes a copy from every book in it
 * (promotions.bundleAvailable, the same count the server checks at checkout). For display,
 * each box set gets the stock its parts allow — tracked with that many sets, or untracked when
 * no part counts stock — so every sold-out / low-stock line and the bag's quantity cap just work.
 * `catalog` must be the raw catalog (parts may be unlisted); nothing is written back anywhere.
 */
export function withBundleStock<T>(books: T[], catalog: any[] = books as any[]): T[] {
  if (!(books || []).some(isBundle)) return books;
  const byId = new Map((catalog || []).filter(Boolean).map((b: any) => [b.id, b]));
  return books.map((book: any) => {
    if (!isBundle(book)) return book;
    const sets = bundleAvailable(book, (id) => byId.get(id));
    return Number.isFinite(sets)
      ? { ...book, trackInventory: true, allowBackorder: false, stockLevel: Math.max(0, sets) }
      : { ...book, trackInventory: false, allowBackorder: false };
  });
}
