// Book photos uploaded since October 2026 carry their resized copies (`srcset`: 480–2400 px, see
// admin/bookPhotoUpload.ts). `photoSrcSet` turns them into `<img srcSet sizes>` so the browser picks
// the sharpest copy the screen can show (the 2400 px one on a retina product page) without shop
// cards downloading it. Older photos and typed URLs have no list and render exactly as before.
import { responsiveSource } from "./mediaRef";

/** How wide a shop card photo is drawn: 2 across on phones, 3–4 on bigger screens. Used only where a grid's columns aren't known. */
export const CARD_PHOTO_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw";

/** A grid's column count from a screen width up (`from` 0 = every screen). */
export type GridStep = { from: number; cols: number };

/** Width ÷ height of a "W:H" / "W / H" shape; undefined when unreadable. */
export function shapeRatio(shape: unknown): number | undefined {
  const m = typeof shape === "string" ? shape.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/) : null;
  return m && Number(m[1]) && Number(m[2]) ? Number(m[1]) / Number(m[2]) : undefined;
}

/**
 * `sizes` for a book photo in a grid of cards, from the grid's real column counts. Each column is offered
 * (screen − the page's side padding `gutter`, default 48px) ÷ columns — a little more than the card, since gaps
 * are ignored — capped at the container's `maxWidth` when it has one. A photo cropped to fill its frame ("cover") is drawn wider than the
 * card when it is wider in shape than the frame, so it asks for that much more. A wrong (too small) `sizes`
 * makes the browser pick a smaller copy and enlarge it, which is what made shop covers look soft.
 */
export function gridPhotoSizes(steps: GridStep[], opts: { photo?: unknown; frame?: unknown; cover?: boolean; maxWidth?: number; gutter?: number } = {}): string {
  const p = opts.photo as { width?: unknown; height?: unknown } | null | undefined;
  const w = Number(p?.width), h = Number(p?.height);
  const frame = shapeRatio(opts.frame);
  const stretch = opts.cover !== false && w > 0 && h > 0 && frame && w / h > frame ? Math.min(4, w / h / frame) : 1;
  const ordered = [...steps].filter(s => s.cols >= 1).sort((a, b) => b.from - a.from);
  if (!ordered.length) return CARD_PHOTO_SIZES;
  const gutter = Math.max(0, opts.gutter ?? 48);
  const share = (cols: number) => Math.ceil((stretch / cols) * 1000) / 1000;
  const vw = (cols: number) => (gutter ? `calc((100vw - ${gutter}px) * ${share(cols)})` : `${Math.ceil(share(cols) * 1000) / 10}vw`);
  const parts: string[] = [];
  if (opts.maxWidth && opts.maxWidth > 0) parts.push(`(min-width: ${opts.maxWidth}px) ${Math.ceil((opts.maxWidth / ordered[0].cols) * stretch)}px`);
  ordered.forEach((s, i) => parts.push(i === ordered.length - 1 || s.from <= 0 ? vw(s.cols) : `(min-width: ${s.from}px) ${vw(s.cols)}`));
  return parts.slice(0, parts.findIndex(x => !x.startsWith("(")) + 1 || parts.length).join(", ");
}
/** The product page's big photo: full width on phones, up to its 900 px maximum beside the buy card. */
export const PDP_PHOTO_SIZES = "(max-width: 1023px) 100vw, 900px";

/**
 * `sizes` for one product-page photo. The photo frame is never wider than Style › Product page › Max width
 * (`maxWidth`, 320–900 px), so any screen wider than that is offered the copy for that width, plus 10% for the hover
 * zoom, never more than PDP_PHOTO_SIZES' 900px. A photo cropped to fill its frame ("cover") is drawn wider than the
 * frame when it is wider in shape (`photoRatio` > `frameRatio`), so the width grows by that much. Narrower screens
 * keep full width, as before. Unknown shapes leave the width at the frame's.
 */
export function pdpPhotoSizes({ maxWidth, photoRatio, frameRatio, cover }: { maxWidth: number; photoRatio?: number; frameRatio?: number; cover: boolean }): string {
  const frame = Math.max(320, Math.min(900, Number(maxWidth) || 560));
  const stretch = cover && photoRatio && frameRatio && photoRatio > frameRatio ? photoRatio / frameRatio : 1;
  return `(max-width: ${frame}px) 100vw, ${Math.min(900, Math.ceil(Math.round(frame * stretch * 110) / 100))}px`;
}
/** Featured product / book spotlight sections: half the page beside the text, full width on phones. */
export const FEATURE_PHOTO_SIZES = "(max-width: 767px) 100vw, 600px";
/** The product page's thumbnail rail. */
export const THUMB_PHOTO_SIZES = "120px";

export function photoSrcSet(photo: unknown, sizes: string): { srcSet?: string; sizes?: string } {
  const p = photo as { url?: unknown; srcset?: unknown } | null | undefined;
  if (!p || typeof p !== "object") return {};
  const source = responsiveSource(p.url, { src: p.url, srcset: p.srcset });
  return source ? { srcSet: source.srcSet, sizes } : {};
}

/**
 * One URL for a small fixed-size picture (bag and checkout lines, search results, sticky bar): the
 * smallest copy at least `minWidth` px wide, so a 64 px thumbnail never downloads the original photo.
 * Photos without copies keep their `url`.
 */
export function smallPhotoUrl(photo: unknown, minWidth = 160): string {
  const p = photo as { url?: unknown; srcset?: unknown } | null | undefined;
  if (!p || typeof p !== "object") return "";
  const url = typeof p.url === "string" ? p.url : "";
  const copies = Array.isArray(p.srcset)
    ? (p.srcset as { url?: unknown; w?: unknown }[])
        .filter((v): v is { url: string; w: number } => !!v && typeof v.url === "string" && !!v.url && typeof v.w === "number" && v.w > 0)
        .sort((a, b) => a.w - b.w)
    : [];
  if (!copies.length) return url;
  return (copies.find(v => v.w >= minWidth) || copies[copies.length - 1]).url;
}
