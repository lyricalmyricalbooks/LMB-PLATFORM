// Book photo/video files in Storage (October 2026). Each book photo is several files (the resized copies,
// the untouched original, a video and its still), so removing a photo in Books › edit, or deleting the book,
// used to leave every one of them in the bucket. After a save, the files of photos that are gone are
// deleted — only files in `products/` (where book uploads go; a picture chosen from the Studio media
// library lives in assets/ and is left alone) and only when no other book and no order still shows them
// (a duplicated book shares its photos; an order line keeps the small copy it was bought with).
//
// Saves also keep copies the server added (functions/imageCopies.js) after the editor opened, so a save
// never strips a photo's `srcset` back to the original.
import type { MediaVariantRef } from "../features/site/mediaRef";

type Photo = { url?: unknown; originalUrl?: unknown; videoUrl?: unknown; srcset?: unknown; width?: unknown; height?: unknown } & Record<string, unknown>;

const BOOK_FILE_PREFIX = "products/";

/** The Storage path of a Firebase download URL in `bucket`, or null for any other address. */
export function storagePathOfUrl(url: unknown, bucket: string): string | null {
  if (typeof url !== "string" || !url || !bucket) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== "firebasestorage.googleapis.com") return null;
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    return m && m[1] === bucket ? decodeURIComponent(m[2]) : null;
  } catch { return null; }
}

/** Every URL a photo entry points at: shown copy, copies, original and video. */
export function photoUrls(photo: unknown): string[] {
  const p = photo as Photo | null;
  if (!p || typeof p !== "object") return typeof photo === "string" ? [photo] : [];
  const out = [p.url, p.originalUrl, p.videoUrl];
  if (Array.isArray(p.srcset)) for (const v of p.srcset as MediaVariantRef[]) out.push(v?.url);
  return out.filter((u): u is string => typeof u === "string" && u.length > 0);
}

const urlOf = (photo: unknown) => (photo && typeof photo === "object" ? (photo as Photo).url : photo);

/** Photos of `before` no longer in `after` (matched by the photo's shown URL). */
export function removedPhotos(before: unknown, after: unknown): unknown[] {
  const kept = new Set((Array.isArray(after) ? after : []).map(urlOf).filter(Boolean));
  return (Array.isArray(before) ? before : []).filter(p => urlOf(p) && !kept.has(urlOf(p)));
}

/** The editor's photo list with the server-made copies of the live record put back where it dropped them. */
export function keepPhotoCopies(next: unknown, live: unknown): unknown {
  if (!Array.isArray(next) || !Array.isArray(live)) return next;
  const byUrl = new Map<unknown, Photo>();
  for (const p of live) if (p && typeof p === "object" && Array.isArray((p as Photo).srcset) && (p as Photo).url) byUrl.set((p as Photo).url, p as Photo);
  let changed = false;
  const out = next.map(p => {
    if (!p || typeof p !== "object" || (Array.isArray((p as Photo).srcset) && ((p as Photo).srcset as unknown[]).length)) return p;
    const from = byUrl.get((p as Photo).url);
    if (!from) return p;
    changed = true;
    return { ...p, srcset: from.srcset, ...(from.width ? { width: from.width } : {}), ...(from.height ? { height: from.height } : {}) };
  });
  return changed ? out : next;
}

/** Book-upload files of `gone` photos that nothing in `stillShown` (URLs of other photos, order lines…) uses. */
export function unusedBookFiles(gone: unknown[], stillShown: Iterable<string>, bucket: string): string[] {
  const used = new Set<string>();
  for (const url of stillShown) { const path = storagePathOfUrl(url, bucket); if (path) used.add(path); }
  const out = new Set<string>();
  for (const photo of gone) {
    for (const url of photoUrls(photo)) {
      const path = storagePathOfUrl(url, bucket);
      if (path && path.startsWith(BOOK_FILE_PREFIX) && !used.has(path)) out.add(path);
    }
  }
  return [...out];
}

/** URLs every book (and its editions) and every order line still shows. */
export function shownUrls(books: any[], orders: any[]): string[] {
  const out: string[] = [];
  for (const book of books || []) {
    for (const photo of Array.isArray(book?.photos) ? book.photos : []) out.push(...photoUrls(photo));
    for (const v of Array.isArray(book?.variants) ? book.variants : []) if (typeof v?.photoUrl === "string") out.push(v.photoUrl);
    if (typeof book?.seoImage === "string") out.push(book.seoImage);
  }
  for (const order of orders || []) {
    for (const item of Array.isArray(order?.items) ? order.items : []) if (typeof item?.photoUrl === "string") out.push(item.photoUrl);
  }
  return out;
}
