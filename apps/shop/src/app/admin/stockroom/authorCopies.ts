// Stockroom › Stock › one book › Copies with the author: the old stockroom's hand-off and return (lib/inventory.js
// transferAuthorStock), as a `mutate` for saveBookState. Publisher shops only (hasPublisherTools).
import { transferAuthorStock } from "@stockroom/inventory.js";

type Row = Record<string, any>;

/** delta > 0 hands copies to the author, < 0 takes them back. Refuses a move that would change nothing. */
export function moveAuthorCopies(book: Row | null, delta: number, note = "") {
  return (s: Row) => {
    const n = Math.floor(Number(delta));
    if (!Number.isFinite(n) || n === 0) throw new Error("Enter a number of copies, 1 or more.");
    const { transfer } = transferAuthorStock(s, book, n, note);
    if (!transfer) throw new Error("Nothing to move.");
    return s;
  };
}
