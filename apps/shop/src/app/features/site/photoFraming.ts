// Per-photo crop & placement (Books › edit › Images › Crop & edit). The uploaded file is never changed:
// the photo record carries `framing: { x, y, zoom }` and every shop frame draws it with CSS. `x`/`y` (0–100) are
// the point that stays in view when the frame is a different shape from the photo (`object-position`), and
// `zoom` (1–3) enlarges the photo around that point, cropping its edges. Photos without framing render exactly
// as before; a frame that doesn't opt in simply shows the whole upload. Quick edits (`adjust`) are below.
// Optional framing keys, saved only when used:
// - `rotate` (−10…10 degrees) straightens a tilted photo. It turns about the frame's centre and enlarges the photo
//   just enough to keep a frame up to `STRAIGHTEN_COVERS` (2:1 either way) filled; wider strips may show a corner.
// - `fit: "contain"` shows the whole photo inside the frame instead of filling it; `background` (#rrggbb) colours the
//   bars around it (none = the frame's own colour).
import type { CSSProperties } from "react";

export type PhotoFraming = { x: number; y: number; zoom: number; rotate?: number; fit?: "contain"; background?: string };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const DEFAULT_FRAMING: PhotoFraming = { x: 50, y: 50, zoom: 1 };
export const MAX_STRAIGHTEN = 10;
/** The widest frame (long side ÷ short side) a straightened photo is enlarged to keep filled. */
export const STRAIGHTEN_COVERS = 2;
const HEX = /^#[0-9a-f]{6}$/i;
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The photo's saved framing, cleaned up; `null` when it has none or it is the default (centred, no zoom). */
export function photoFraming(photo: unknown): PhotoFraming | null {
  const f = (photo as { framing?: unknown } | null | undefined)?.framing as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  const x = num(f.x), y = num(f.y), zoom = num(f.zoom);
  const framing: PhotoFraming = {
    x: Math.round(clamp(x ?? 50, 0, 100) * 10) / 10,
    y: Math.round(clamp(y ?? 50, 0, 100) * 10) / 10,
    zoom: Math.round(clamp(zoom ?? 1, MIN_ZOOM, MAX_ZOOM) * 100) / 100,
  };
  const rotate = Math.round(clamp(num(f.rotate) ?? 0, -MAX_STRAIGHTEN, MAX_STRAIGHTEN) * 10) / 10;
  if (rotate) framing.rotate = rotate;
  if (f.fit === "contain") {
    framing.fit = "contain";
    if (typeof f.background === "string" && HEX.test(f.background)) framing.background = f.background.toLowerCase();
  }
  return isDefaultFraming(framing) ? null : framing;
}

export function isDefaultFraming(f: PhotoFraming): boolean {
  return f.x === 50 && f.y === 50 && f.zoom === 1 && !f.rotate && f.fit !== "contain";
}

/** How much a photo straightened by `degrees` is enlarged so a frame up to `STRAIGHTEN_COVERS` stays filled. */
export function straightenScale(degrees: number): number {
  const t = (Math.abs(degrees) * Math.PI) / 180;
  return Math.round((Math.cos(t) + STRAIGHTEN_COVERS * Math.sin(t)) * 1000) / 1000;
}

/**
 * The straighten turn about the frame's centre, written relative to a transform origin at the chosen point. It goes
 * first in the transform list, so it applies on top of the zoom and flip: the zoomed photo already fills the frame,
 * and the enlargement keeps it filled once turned. A photo shown whole (`fit: "contain"`) is enlarged too, so its
 * coloured bars turn with it without leaving bare corners.
 */
function straightenTransform(f: PhotoFraming | null): string | null {
  if (!f?.rotate) return null;
  const turn = `rotate(${f.rotate}deg) scale(${straightenScale(f.rotate)})`;
  const cx = 50 - f.x, cy = 50 - f.y;
  return cx || cy ? `translate(${pct(cx)}, ${pct(cy)}) ${turn} translate(${pct(-cx)}, ${pct(-cy)})` : turn;
}

function fitStyle(f: PhotoFraming | null): CSSProperties {
  if (f?.fit !== "contain") return {};
  return f.background ? { objectFit: "contain", backgroundColor: f.background } : { objectFit: "contain" };
}

/** What to save on the photo: the cleaned framing, or `undefined` to drop the key when it is back to default. */
export function framingToSave(f: PhotoFraming): PhotoFraming | undefined {
  return photoFraming({ framing: f }) || undefined;
}

/**
 * Quick edits (same dialog): light, colour, detail and mirroring, saved on the photo as `adjust`. Like the crop
 * they are drawn by the browser, so the uploaded file and its sharp copies never change.
 * - Brightness and contrast are 50–150 (%), saturation 0–200 (0 = black & white); 100 = unchanged. These are CSS
 *   filters.
 * - Highlights, shadows, warmth and tint are −100…100 and sharpen 0…100; 0 = unchanged. CSS has no filter for
 *   them, so they are an SVG filter (`photoTone`) that `PhotoToneDefs` draws next to the photo; the style points
 *   at it with `url(#id)`. Every element given a style from here must have `<PhotoToneDefs>` beside it.
 */
export type PhotoAdjust = {
  brightness: number; contrast: number; saturation: number;
  highlights: number; shadows: number; warmth: number; tint: number; sharpen: number; clarity: number;
  flipX: boolean; flipY: boolean;
};

export const DEFAULT_ADJUST: PhotoAdjust = {
  brightness: 100, contrast: 100, saturation: 100,
  highlights: 0, shadows: 0, warmth: 0, tint: 0, sharpen: 0, clarity: 0,
  flipX: false, flipY: false,
};
export const ADJUST_RANGES = {
  brightness: [50, 150], contrast: [50, 150], saturation: [0, 200],
  highlights: [-100, 100], shadows: [-100, 100], warmth: [-100, 100], tint: [-100, 100], sharpen: [0, 100], clarity: [0, 100],
} as const;
export type AdjustLevel = keyof typeof ADJUST_RANGES;
const LEVELS = Object.keys(ADJUST_RANGES) as AdjustLevel[];

/** The photo's saved quick edits, cleaned up; `null` when it has none or they change nothing. */
export function photoAdjust(photo: unknown): PhotoAdjust | null {
  const a = (photo as { adjust?: unknown } | null | undefined)?.adjust as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return null;
  const adjust = { ...DEFAULT_ADJUST, flipX: a.flipX === true, flipY: a.flipY === true };
  for (const key of LEVELS) {
    const [lo, hi] = ADJUST_RANGES[key];
    adjust[key] = Math.round(clamp(num(a[key]) ?? DEFAULT_ADJUST[key], lo, hi));
  }
  return isDefaultAdjust(adjust) ? null : adjust;
}

export function isDefaultAdjust(a: PhotoAdjust): boolean {
  return LEVELS.every((key) => a[key] === DEFAULT_ADJUST[key]) && !a.flipX && !a.flipY;
}

/** What to save on the photo: the cleaned edits, or `undefined` to drop the key when nothing is changed. */
export function adjustToSave(a: PhotoAdjust): PhotoAdjust | undefined {
  return photoAdjust({ adjust: a }) || undefined;
}

const fixed = (n: number) => String(Math.round(n * 1000) / 1000);

/** The SVG filter for highlights, shadows, warmth, tint and sharpen, or `null` when none is set. */
export type PhotoTone = { id: string; matrix?: string; table?: string; kernel?: string };
export function photoTone(a: PhotoAdjust | null): PhotoTone | null {
  if (!a || (!a.highlights && !a.shadows && !a.warmth && !a.tint && !a.sharpen)) return null;
  const tone: PhotoTone = {
    id: `fm-tone-${[a.highlights, a.shadows, a.warmth, a.tint, a.sharpen].map((n) => (n < 0 ? `m${-n}` : n)).join("-")}`,
  };
  if (a.warmth || a.tint) {
    // White balance as channel gains: warmer = more red, less blue; tint + = magenta (less green), − = green.
    const w = a.warmth / 100, t = a.tint / 100;
    const r = 1 + 0.15 * w + 0.05 * t, g = 1 - 0.1 * t, b = 1 - 0.15 * w + 0.05 * t;
    tone.matrix = `${fixed(r)} 0 0 0 0 0 ${fixed(g)} 0 0 0 0 0 ${fixed(b)} 0 0 0 0 0 1 0`;
  }
  if (a.highlights || a.shadows) {
    // A tone curve: shadows move the darker tones (most near a third), highlights the lighter ones (most near
    // two thirds); pure black and pure white stay where they are, and the curve never turns back on itself.
    const h = a.highlights / 100, sh = a.shadows / 100;
    const points: string[] = [];
    for (let i = 0; i <= 16; i++) {
      const x = i / 16;
      points.push(fixed(clamp(x + sh * x * (1 - x) ** 2 + h * x * x * (1 - x), 0, 1)));
    }
    tone.table = points.join(" ");
  }
  if (a.sharpen) {
    const k = (a.sharpen / 100) * 0.6;
    tone.kernel = `0 ${fixed(-k)} 0 ${fixed(-k)} ${fixed(1 + 4 * k)} ${fixed(-k)} 0 ${fixed(-k)} 0`;
  }
  return tone;
}

/**
 * Clarity (0…100): local contrast, so paper texture, print and lettering stand out without changing the overall
 * light. Its own SVG filter, measured against the photo's size (`objectBoundingBox`), so a shop card and the big
 * book-page photo get the same look: the photo plus `k` × (photo − a wide blur of it).
 */
export type PhotoClarity = { id: string; k: number; blur: number };
export function photoClarity(a: PhotoAdjust | null): PhotoClarity | null {
  if (!a?.clarity) return null;
  return { id: `fm-clarity-${a.clarity}`, k: Math.round((a.clarity / 100) * 0.5 * 1000) / 1000, blur: 0.015 };
}

/** CSS `filter` for the edits (the SVG tone and clarity first, then light and colour), or `undefined` when unchanged. */
export function adjustFilter(a: PhotoAdjust | null): string | undefined {
  if (!a) return undefined;
  const tone = photoTone(a);
  const clarity = photoClarity(a);
  const parts = [
    tone && `url(#${tone.id})`,
    clarity && `url(#${clarity.id})`,
    a.brightness !== 100 && `brightness(${a.brightness / 100})`,
    a.contrast !== 100 && `contrast(${a.contrast / 100})`,
    a.saturation !== 100 && `saturate(${a.saturation / 100})`,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

/**
 * Inline style for an `<img>` / `<video>` that fills its frame (`w-full h-full`, frame `overflow-hidden`).
 * `fallback` is the frame's own placement (e.g. Studio's catalog focal point) for photos with no framing of their
 * own. The zoom uses `transform`, so Tailwind hover zooms (`scale-*`, the separate `scale` property) still stack on
 * top. Motion elements, which own `transform`, use `motionFraming` instead.
 *
 * The framing's point is where it sits on the photo as shown (mirrored when flipped). A flip mirrors the photo about
 * the frame's centre, so `object-position` is mirrored too and the same part stays in view; the zoom then grows
 * from the chosen point as before.
 */
export function framingStyle(photo: unknown, fallback?: { x: number; y: number }): CSSProperties {
  const f = photoFraming(photo);
  const a = photoAdjust(photo);
  if (!f && !a) return fallback ? { objectPosition: `${fallback.x}% ${fallback.y}%` } : {};
  const point = f || { ...(fallback || DEFAULT_FRAMING), zoom: 1 };
  const sx = a?.flipX ? -1 : 1, sy = a?.flipY ? -1 : 1;
  const style: CSSProperties = fitStyle(f);
  if (f || fallback || sx < 0 || sy < 0) {
    style.objectPosition = `${sx < 0 ? 100 - point.x : point.x}% ${sy < 0 ? 100 - point.y : point.y}%`;
  }
  const straighten = straightenTransform(f);
  const transform: string[] = straighten ? [straighten] : [];
  if (point.zoom > 1) transform.push(`scale(${point.zoom})`);
  if (sx < 0 || sy < 0) {
    // Mirror about the frame's centre, written relative to the transform origin (the chosen point).
    const cx = 50 - point.x, cy = 50 - point.y;
    transform.push(cx || cy
      ? `translate(${pct(cx)}, ${pct(cy)}) scale(${sx}, ${sy}) translate(${pct(-cx)}, ${pct(-cy)})`
      : `scale(${sx}, ${sy})`);
  }
  if (transform.length) {
    style.transform = transform.join(" ");
    style.transformOrigin = `${point.x}% ${point.y}%`;
  }
  const filter = adjustFilter(a);
  if (filter) style.filter = filter;
  return style;
}

/** The quick edits alone, for a view that shows the whole photo (the enlarged viewer): colour, mirroring and the
 * straighten turn (not enlarged, since the whole photo is shown). */
export function adjustStyle(photo: unknown): CSSProperties {
  const a = photoAdjust(photo);
  const rotate = photoFraming(photo)?.rotate;
  if (!a && !rotate) return {};
  const style: CSSProperties = {};
  const transform = [
    rotate && `rotate(${rotate}deg)`,
    a && (a.flipX || a.flipY) && `scale(${a.flipX ? -1 : 1}, ${a.flipY ? -1 : 1})`,
  ].filter(Boolean);
  if (transform.length) style.transform = transform.join(" ");
  const filter = adjustFilter(a);
  if (filter) style.filter = filter;
  return style;
}

/**
 * For `motion` images, which own `transform`: placement, colour and the zoom/flip as motion values, plus the hover
 * target (`hoverScale` × the crop's zoom). Motion writes translate → scale → scaleX/scaleY, so a flip about the frame's
 * centre becomes a translate that depends on the scale, given for both the resting and the hover size. Motion can't
 * put a turn on top of its own transform, so a straightened photo also gets a `transformTemplate` that adds it in
 * front (pass it to the motion element).
 */
export function motionFraming(photo: unknown, hoverScale = 1): {
  style: Record<string, string | number>; hover: Record<string, string | number>;
  transformTemplate?: (values: unknown, generated: string) => string;
} {
  const f = photoFraming(photo);
  const a = photoAdjust(photo);
  if (!f && !a) return { style: {}, hover: { scale: hoverScale } };
  const point = f || { ...DEFAULT_FRAMING };
  const sx = a?.flipX ? -1 : 1, sy = a?.flipY ? -1 : 1;
  const shift = (zoom: number) => {
    const out: Record<string, string> = {};
    if (sx < 0 && point.x !== 50) out.x = pct(zoom * (50 - point.x) * 2);
    if (sy < 0 && point.y !== 50) out.y = pct(zoom * (50 - point.y) * 2);
    return out;
  };
  const style: Record<string, string | number> = {
    ...(fitStyle(f) as Record<string, string>),
    objectPosition: `${sx < 0 ? 100 - point.x : point.x}% ${sy < 0 ? 100 - point.y : point.y}%`,
    transformOrigin: `${point.x}% ${point.y}%`,
    scale: point.zoom,
    ...shift(point.zoom),
  };
  if (sx < 0) style.scaleX = -1;
  if (sy < 0) style.scaleY = -1;
  const filter = adjustFilter(a);
  if (filter) style.filter = filter;
  const hoverZoom = hoverScale * point.zoom;
  const straighten = straightenTransform(f);
  return {
    style,
    hover: { scale: hoverZoom, ...shift(hoverZoom) },
    ...(straighten ? { transformTemplate: (_: unknown, generated: string) => (generated && generated !== "none" ? `${straighten} ${generated}` : straighten) } : {}),
  };
}

/**
 * Moving the placement by dragging the photo: a drag of `dx`/`dy` pixels across a `width`×`height` preview moves
 * the point in view the opposite way (dragging the photo right shows more of its left side). Zoomed photos move
 * more slowly per pixel, so the photo follows the pointer.
 */
export function dragFraming(start: PhotoFraming, dx: number, dy: number, width: number, height: number): PhotoFraming {
  if (!(width > 0) || !(height > 0)) return start;
  const k = 100 / start.zoom;
  return {
    ...start,
    x: Math.round(clamp(start.x - (dx / width) * k, 0, 100) * 10) / 10,
    y: Math.round(clamp(start.y - (dy / height) * k, 0, 100) * 10) / 10,
  };
}
