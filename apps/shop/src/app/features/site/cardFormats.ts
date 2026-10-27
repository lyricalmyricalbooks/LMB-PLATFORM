// "Formats on shop cards" (Shopify themes' "available in N colours" hint), Studio › Style › Book cards in the
// shop grid › showCardFormats (off by default). Display only: the book page still decides what can be bought.
import { bookFormats, type FormatKey } from "./CatalogControls";

/** The formats a shop card lists, in the filter's order: only when the book comes in two or more named
 *  formats (paperback, hardcover, e-book, audiobook), so single-format books keep their card unchanged. */
export function cardFormats(book: any): FormatKey[] {
  const named = bookFormats(book).filter(key => key !== "other");
  return named.length >= 2 ? named : [];
}
