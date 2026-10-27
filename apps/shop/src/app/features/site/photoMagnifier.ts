// Zoom that follows the mouse on the book page's main photo (Shopify's "hover zoom"):
// Studio › Style › Book page · photos & layout › Photos › showPdpMagnifier (off by default) +
// pdpMagnifierLevel. Pure rules; PhotoMagnifier.tsx draws it. Display only.

export const MAGNIFIER_DEFAULT_LEVEL = 2.5;
export const MAGNIFIER_MIN_LEVEL = 1.5;
export const MAGNIFIER_MAX_LEVEL = 4;

/** Is the zoom switched on in this design? */
export function magnifierOn(design: any): boolean {
  return design?.showPdpMagnifier === true;
}

/** How many times bigger the photo grows under the mouse (1.5–4, default 2.5). */
export function magnifierLevel(design: any): number {
  const n = Number(design?.pdpMagnifierLevel);
  if (!Number.isFinite(n) || n <= 0) return MAGNIFIER_DEFAULT_LEVEL;
  return Math.min(MAGNIFIER_MAX_LEVEL, Math.max(MAGNIFIER_MIN_LEVEL, n));
}

/** The point under the mouse as percentages of the frame (0–100 each), so the zoom grows from there. */
export function magnifierOrigin(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
  const x = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 100 : 50;
  const y = rect.height > 0 ? ((clientY - rect.top) / rect.height) * 100 : 50;
  return { x: clamp(x), y: clamp(y) };
}
