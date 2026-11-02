// Made to order (plan 12.12). A product can carry a lead time in the owner's words ("2 to 3 weeks"): the book page then
// says it is made to order and ships in that time instead of "In stock", and the quick "ships by" lines (book page, bag)
// stay off for it, because they promise a date a made-to-order item can't meet. Display only: it never changes stock,
// price or an order. Pure.

export const MADE_TO_ORDER_MAX = 40;

/** The product's lead time, trimmed and capped, or "" when it isn't made to order. */
export function madeToOrderTime(book: object | null | undefined): string {
  return String((book as { madeToOrderTime?: unknown } | null | undefined)?.madeToOrderTime ?? "").replace(/\s+/g, " ").trim().slice(0, MADE_TO_ORDER_MAX);
}
