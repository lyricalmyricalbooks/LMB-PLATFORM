import { catalogUnitPrice, type CartItem } from "../../CartContext";
import { bundleComponents, isGiftCardProduct } from "./promotions";
import { smallPhotoUrl } from "./photoSources";

/**
 * Studio preview only: checkout with an empty bag shows just "Your bag is empty", so none of the
 * Checkout style controls, words or Cart-template sections could be seen while editing them. The
 * preview borrows one ordinary book as a display-only line. It is never put in the shopper's bag
 * (CartContext / storage), and Pay already does nothing in `?preview=true`.
 */
export function previewSampleCart(books: any[]): CartItem[] {
  for (const book of Array.isArray(books) ? books : []) {
    if (!book?.id || isGiftCardProduct(book) || bundleComponents(book).length || book.comingSoon === true) continue;
    const variants = Array.isArray(book.variants) ? book.variants : [];
    const variant = variants.find((v: any) => catalogUnitPrice(book, v) > 0);
    const price = variants.length ? (variant ? catalogUnitPrice(book, variant) : NaN) : catalogUnitPrice(book);
    if (!(price > 0)) continue;
    return [{
      id: book.id,
      ...(variant ? { variantId: variant.id, variantName: variant.name } : {}),
      title: String(book.title || ""),
      price,
      quantity: 1,
      photoUrl: smallPhotoUrl(book.photos?.[0]) || book.photoUrl || "",
      shippingProfileId: book.shippingProfileId || "",
    }];
  }
  return [];
}
