import { useEffect, useState, useCallback } from "react";
import { emitShopSignal } from "./shopSignals";

export const WISHLIST_KEY = "fm_wishlist_v1";
const KEY = WISHLIST_KEY;
const EVENT = "fm_wishlist_change";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Valid JSON that isn't a list (e.g. "null") must not crash every product card.
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

export function useWishlist() {
  const [ids, setIds] = useState<string[]>(() => (typeof window === "undefined" ? [] : read()));

  useEffect(() => {
    const sync = () => setIds(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const current = read();
    const adding = !current.includes(id);
    const next = adding ? [...current, id] : current.filter(x => x !== id);
    write(next);
    if (adding) emitShopSignal("wishlistAdd", id);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter(x => x !== id));
  }, []);

  /** Adds books from a shared list to this shopper's own (skips ones already saved). */
  const addMany = useCallback((add: string[]) => {
    const current = read();
    const fresh = add.filter(id => !current.includes(id));
    if (fresh.length) write([...current, ...fresh]);
    return fresh.length;
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, remove, addMany, has, count: ids.length };
}

/**
 * How many saved books a shopper can still open: the same rule as the Wishlist page
 * (a book later unpublished, scheduled or deleted drops off). Before the catalog has
 * loaded, every saved id counts so the badge doesn't flicker to zero.
 */
export function liveWishlistCount(ids: string[], books: any[], isLive: (book: any) => boolean): number {
  if (!books.length) return ids.length;
  return ids.filter(id => books.some(book => book.id === id && isLive(book))).length;
}
