// Book photo uploads (Books › edit › Photos). Each photo is stored as WebP copies 480–3200 px wide
// (`prepareMediaVariants` with BOOK_PHOTO_WIDTHS; 0.90 up to card size, 0.95 above), so the product page and the
// full-screen viewer show a crisp copy on retina screens while shop cards and phones download a small
// one. The book keeps the largest copy as its `url` (shared links, search engines, emails) plus a
// public `srcset` list the storefront turns into `<img srcset>` (features/site/photoSources.ts).
// The file exactly as chosen is kept too (`originalUrl`, never shown to shoppers), so better copies
// can be made from it later without asking for the photo again. GIFs/SVGs, and browsers that can't
// decode the file, keep the old single upload.
import { adminApi } from "./api";
import { mediaApi } from "./mediaApi";
import { BOOK_PHOTO_WIDTHS, bookPhotoQuality, MAX_BOOK_IMAGE_EDGE, prepareMediaVariants, prepareProductImage } from "./prepareImage";
import type { MediaVariantRef } from "../features/site/mediaRef";

export type BookPhotoFile = { url: string; srcset?: MediaVariantRef[]; width?: number; height?: number; originalUrl?: string };

/** `products/1700000000000-cover-960w.webp` — safe file name, one stamp shared by a photo's copies. */
export function bookPhotoPath(stamp: number, fileName: string): string {
  const safe = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "photo";
  return `products/${stamp}-${safe}`;
}

export async function uploadBookPhoto(file: File, now = Date.now()): Promise<BookPhotoFile> {
  const prepared = await prepareMediaVariants(file, { widths: BOOK_PHOTO_WIDTHS, quality: bookPhotoQuality });
  if (!prepared.resized) {
    const ready = await prepareProductImage(file, MAX_BOOK_IMAGE_EDGE);
    return { url: await adminApi.uploadFile(ready, bookPhotoPath(now, ready.name)) };
  }
  const stored: { url: string; w: number; path: string }[] = [];
  let originalUrl = "";
  try {
    for (const v of prepared.variants) {
      const path = bookPhotoPath(now, v.file.name);
      stored.push({ url: await adminApi.uploadFile(v.file, path), w: v.width, path });
    }
    const ext = (file.name.match(/\.([A-Za-z0-9]+)$/)?.[1] || file.type.split("/")[1] || "img").toLowerCase();
    const path = bookPhotoPath(now, `${file.name.replace(/\.[^.]+$/, "") || "photo"}-original.${ext}`);
    originalUrl = await adminApi.uploadFile(file, path);
    stored.push({ url: originalUrl, w: 0, path });
  } catch (error) {
    // Nothing half-added: copies already stored are removed before the error is shown.
    await mediaApi.removeFiles(stored.map(s => s.path)).catch(() => {});
    throw error;
  }
  const srcset = stored.filter(s => s.w > 0).map(({ url, w }) => ({ url, w })).sort((a, b) => a.w - b.w);
  return { url: srcset[srcset.length - 1].url, srcset, width: prepared.width, height: prepared.height, originalUrl };
}
