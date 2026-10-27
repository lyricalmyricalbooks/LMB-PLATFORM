// Studio media library (2.4) — the small public record an image field carries when its picture was
// chosen from the library. It sits beside the field as the companion key `${field}__media` (like the
// `__focalX` / `__fit` image-style keys), so section settings keep the plain URL they always had and
// older designs, typed URLs and plain uploads render exactly as before.
//
// Shoppers can't read the admin-only `media/{id}` records, so everything the storefront needs for
// `srcset` (each resized copy's URL and width, the picture's size and its description) lives here.

export type MediaVariantRef = { url: string; w: number };
export type MediaRef = {
  id: string;
  /** The URL written into the field. The record only applies while the field still holds it. */
  src: string;
  srcset: MediaVariantRef[];
  width?: number;
  height?: number;
  alt?: string;
};

export const MEDIA_SUFFIX = "__media";

/** `imageUrl` → `imageUrl__media`. */
export const mediaKey = (fieldKey: string) => `${fieldKey}${MEDIA_SUFFIX}`;

/**
 * The responsive-image details for `src`, or null when the field holds a plain URL — no record, a
 * malformed one, or a record left over from a picture the owner has since replaced by typing or
 * uploading another URL (the record's `src` no longer matches).
 */
export function responsiveSource(src: unknown, ref: unknown): { srcSet: string; width?: number; height?: number; alt: string } | null {
  if (typeof src !== "string" || !src || !ref || typeof ref !== "object") return null;
  const r = ref as Partial<MediaRef>;
  if (r.src !== src || !Array.isArray(r.srcset)) return null;
  const entries = r.srcset
    .filter((v): v is MediaVariantRef => !!v && typeof v.url === "string" && v.url.length > 0 && Number.isFinite(v.w) && v.w > 0)
    .sort((a, b) => a.w - b.w);
  if (!entries.length) return null;
  const size = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined);
  const width = size(r.width), height = size(r.height);
  return {
    // Commas are legal inside URLs but end a srcset candidate, so they're escaped.
    srcSet: entries.map(v => `${v.url.replace(/,/g, "%2C")} ${Math.round(v.w)}w`).join(", "),
    ...(width && height ? { width, height } : {}),
    alt: typeof r.alt === "string" ? r.alt : "",
  };
}
