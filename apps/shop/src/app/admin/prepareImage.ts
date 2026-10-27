// Shrinks oversized photos before upload (keeps the whole image — no cropping). 2400 px keeps a
// product photo sharp on high-density (retina) screens at the product page's widest setting (900 px).
export const MAX_IMAGE_EDGE = 2400;
// Studio banners and backgrounds span the full screen, so they keep a little more detail.
export const MAX_STUDIO_IMAGE_EDGE = 2800;
/** A photo already within the size limit and below this many bytes is uploaded exactly as chosen. */
export const KEEP_ORIGINAL_BYTES = 2_500_000;
/** Encoder quality for a re-saved photo (WebP/JPEG). High enough that type and fine print stay crisp. */
export const PHOTO_QUALITY = 0.92;

export function fitWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return { width: Math.round(width * scale), height: Math.round(height * scale), scaled: scale < 1 };
}

export async function prepareProductImage(file: File, maxEdge = MAX_IMAGE_EDGE): Promise<File> {
  // GIFs (animation) and SVGs (vector) are uploaded untouched.
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height, scaled } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    if (!scaled && file.size < KEEP_ORIGINAL_BYTES) { bitmap.close?.(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const type = file.type === "image/png" ? "image/png" : "image/webp";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, PHOTO_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".webp");
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}

// ── Studio media library (2.4) ─────────────────────────────────────────────
// Every library picture (and every uploaded book photo) is stored as WebP copies 480, 960, 1600 and
// 2400 px wide, so phones download the small one and big or retina screens the large one (`srcset`).
// Smaller originals are never enlarged.
export const MEDIA_WIDTHS = [480, 960, 1600, 2400] as const;
export const MEDIA_QUALITY = 0.88;

// Book photos (covers and spreads) carry fine type, so they get one bigger copy and a higher
// quality: the product page photo is up to 900 px wide, which a 3x phone or retina laptop draws
// with ~2700 real pixels, and the full-screen photo viewer can use the 3200 px copy. Shop cards and
// phones download a small copy (`srcset`): the card-sized copies (≤ 960 px, plus a 640 px one for
// retina phones and laptops) are saved at 0.90 (0.82 smoothed printed grain on covers), still far lighter than
// 0.95 — Storage bandwidth is billed per download (October 2026). functions/imageCopies.js makes
// the same copies for photos uploaded before these existed; keep the two ladders equal.
export const BOOK_PHOTO_WIDTHS = [480, 640, 960, 1600, 2400, 3200] as const;
export const BOOK_PHOTO_QUALITY = 0.95;
export const BOOK_CARD_COPY_MAX = 960;
export const BOOK_CARD_QUALITY = 0.9;
/** The quality a book photo copy of this width is saved at. */
export const bookPhotoQuality = (width: number) => (width <= BOOK_CARD_COPY_MAX ? BOOK_CARD_QUALITY : BOOK_PHOTO_QUALITY);
/** Largest edge of a book photo uploaded as one file (when the browser can't make the copies). */
export const MAX_BOOK_IMAGE_EDGE = 3200;

export type VariantOptions = { widths?: readonly number[]; quality?: number | ((width: number) => number) };

/** The copy widths made for a picture `originalWidth` px wide: [480, 960, 1600, 2400], [480, 960, 1200], [300]… */
export function mediaWidthsFor(originalWidth: number, ladder: readonly number[] = MEDIA_WIDTHS): number[] {
  const original = Math.round(originalWidth);
  if (!(original > 0)) return [];
  const widths: number[] = ladder.filter(w => w <= original);
  const largest = ladder[ladder.length - 1];
  if (original < largest && !widths.includes(original)) widths.push(original);
  return widths;
}

export type MediaVariantFile = { width: number; height: number; file: File };
export type PreparedMedia = { width: number; height: number; variants: MediaVariantFile[]; resized: boolean };

/**
 * Resizes a photo into the library's copies. GIFs (animation), SVGs (vector) and browsers that can't
 * decode the file keep the original as the only copy (`resized: false`) — still usable, just without
 * `srcset`.
 */
export async function prepareMediaVariants(file: File, options: VariantOptions = {}): Promise<PreparedMedia> {
  const ladder = options.widths ?? MEDIA_WIDTHS;
  const qualityOf = (w: number) => (typeof options.quality === "function" ? options.quality(w) : options.quality ?? MEDIA_QUALITY);
  const original: PreparedMedia = { width: 0, height: 0, variants: [{ width: 0, height: 0, file }], resized: false };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return original;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    const variants: MediaVariantFile[] = [];
    for (const w of mediaWidthsFor(width, ladder)) {
      const h = Math.max(1, Math.round((height * w) / width));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, w, h);
      const quality = qualityOf(w);
      let blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/webp", quality));
      // Browsers without a WebP encoder hand back PNG; use JPEG for photos instead (PNG keeps transparency).
      if (blob && blob.type !== "image/webp" && file.type !== "image/png") blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", quality));
      if (!blob) return { ...original, width, height, variants: [{ width, height, file }] };
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
      variants.push({ width: w, height: h, file: new File([blob], `${base}-${w}w.${ext}`, { type: blob.type }) });
    }
    return variants.length ? { width, height, variants, resized: true } : { ...original, width, height, variants: [{ width, height, file }] };
  } catch {
    return original;
  } finally {
    bitmap?.close?.();
  }
}
