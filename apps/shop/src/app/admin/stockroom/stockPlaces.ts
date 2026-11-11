// Stockroom › Stock › Places: the old stockroom's "stock in more than one place" (lib/stock-places.js), used as is.
// Each helper is a `mutate` for saveBookState: it moves copies on the book's own copy, or throws to refuse.
import { movePlaceStock, removePlace } from "@stockroom/stock-places.js";

type Row = Record<string, any>;

export function moveCopies(book: Row | null, move: { from: string; to: string; qty: number; note?: string }, now = Date.now()) {
  return (s: Row) => {
    const r = movePlaceStock(s, book, { ...move, now });
    if (!r.ok) throw new Error(r.error);
    return s;
  };
}

export function closePlace(book: Row | null, name: string) {
  return (s: Row) => {
    const r = removePlace(s, book, name);
    if (!r.ok) throw new Error(r.error);
    return s;
  };
}
