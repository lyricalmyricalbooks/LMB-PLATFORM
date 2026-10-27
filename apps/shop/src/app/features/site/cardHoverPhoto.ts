// "Show second photo on hover" for the shop grid (Shopify themes' second-image-on-hover), Studio › Style ›
// Book cards in the shop grid › showCardHoverPhoto (off by default). Display only.
import { isVideoItem } from "./bookVideo";

/** The photo a shop card swaps to under the mouse: the book's next plain photo after the cover, else null
 *  (one photo, or only videos after it — a video's still frame would read as a broken player). */
export function cardHoverPhoto(book: any): { url: string } | null {
  const photos: any[] = Array.isArray(book?.photos) ? book.photos : [];
  for (const p of photos.slice(1)) {
    const url = typeof p?.url === "string" ? p.url.trim() : "";
    if (url && /^https?:\/\//i.test(url) && !isVideoItem(p)) return p;
  }
  return null;
}
