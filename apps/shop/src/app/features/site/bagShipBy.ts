// "Order now — ships by …" in the shopping bag (Studio › Style › Cart drawer › Total & checkout button ›
// cartDrawerShowShipBy, off by default). Same promise as the book page's Ships-by line (shipBy.ts, the owner's
// working days / cut-off / closed days), so it may only show when every printed book in the bag could leave today:
// in stock for the copies asked, not a pre-order, backorder, Coming soon or box set. E-books and gift cards don't
// ship and are ignored; a bag with nothing printed shows nothing. Display only: it never changes an order. Pure.
import { catalogFulfillmentItems } from "./checkoutFulfillment";
import { preorderActive, linePreorderOpen } from "./preorder";
import { comingSoonActive } from "./comingSoon";
import { isBundle } from "./promotions";

type BagLine = { id: string; variantId?: string; price: number; quantity: number; preorder?: boolean; releaseDate?: string | null; promoGift?: boolean };

export function cartShipByOn(design: any): boolean {
  return design?.cartDrawerShowShipBy === true;
}

/** True when the bag holds printed books and every one of them can be sent on the owner's usual schedule. */
export function bagShipsOnSchedule(cart: BagLine[], books: Map<string, any>, now: Date = new Date()): boolean {
  const items = catalogFulfillmentItems(cart, books);
  if (!items || !cart.length) return false;
  let printed = 0;
  for (let i = 0; i < cart.length; i++) {
    if (!items[i].physical) continue;
    printed++;
    const line = cart[i];
    const book = books.get(line.id);
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    if (!book || isBundle(book) || comingSoonActive(book) || preorderActive(book, now) || linePreorderOpen(line, now)) return false;
    const variant = line.variantId ? (book.variants || []).find((v: any) => v.id === line.variantId) : null;
    if ((variant ? variant.onBackorder : book.onBackorder) === true) return false;
    if (variant) {
      if (!(Number(variant.stockLevel ?? variant.stock ?? 0) >= qty)) return false;
    } else if (book.trackInventory === true || book.stockLevel !== undefined) {
      if (!(Number(book.stockLevel ?? 0) >= qty)) return false;
    }
  }
  return printed > 0;
}
