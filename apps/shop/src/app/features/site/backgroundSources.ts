// Section background pictures sized to the screen (Studio 3.0 phase 7). A background picked from the Media library
// carries its smaller copies in `bgImageUrl__media` (mediaRef.ts). Phones get the smallest copy at least 1600 px wide and
// tablets the smallest at least 2400 px, through a `--fm-bg-img` variable on the section wrapper that the section's
// `background-image: var(--fm-bg-img, url(full))` reads; computers keep the full picture. A typed or uploaded URL with no
// library record renders exactly as before. (The library makes WebP copies; there is no AVIF.)
import { UP_TO } from "./breakpoints";
import { mediaKey, type MediaRef } from "./mediaRef";

const FIELD = "bgImageUrl";
// "cover" scales a landscape picture to the section's height on an upright screen, so the copy is a step larger than the
// screen's width alone would need (a 960 px copy would be stretched about 4x across a tall section on a phone).
export const PHONE_MIN_WIDTH = 1600;
export const TABLET_MIN_WIDTH = 2400;

/** An unquoted url() CSS value: characters that would end it (quotes, brackets, spaces, backslashes) are %-encoded,
 *  so it needs no quotes and stays intact in a server-rendered <style>. */
export const cssUrl = (url: string) => `url(${url.replace(/["'()\\\s]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)})`;

/** The library copies of the section's background picture, smallest first; null for a plain URL. */
export function backgroundCopies(settings: any): { url: string; w: number }[] | null {
  const src = settings?.[FIELD];
  const ref = settings?.[mediaKey(FIELD)] as Partial<MediaRef> | undefined;
  if (typeof src !== "string" || !src || !ref || typeof ref !== "object" || ref.src !== src || !Array.isArray(ref.srcset)) return null;
  const list = ref.srcset
    .filter(v => v && typeof v.url === "string" && v.url && /^https?:\/\//i.test(v.url) && Number.isFinite(v.w) && v.w > 0)
    .map(v => ({ url: v.url, w: Math.round(v.w) }))
    .sort((a, b) => a.w - b.w);
  return list.length ? list : null;
}

const pick = (list: { url: string; w: number }[], min: number) => list.find(v => v.w >= min) || list[list.length - 1];

/** Whether the section's background reads `--fm-bg-img` (only when the picture has library copies). */
export const hasResponsiveBackground = (settings: any) => backgroundCopies(settings) !== null;

/** The section's background-image value: plain url() as always, or the variable with the full picture as fallback. */
export function backgroundImageValue(settings: any): string {
  const src = String(settings?.[FIELD] || "");
  return hasResponsiveBackground(settings) ? `var(--fm-bg-img, ${cssUrl(src)})` : `url(${src})`;
}

/** Per-screen-size `--fm-bg-img` rules for `#section-<id>`; "" when there is nothing smaller to offer. */
export function backgroundImageCss(sectionId: string, settings: any): string {
  const copies = backgroundCopies(settings);
  if (!copies) return "";
  // Only a section that shows the picture (a gradient or colour wins over it in bgStyle).
  if (settings.bgColor || settings.bgGradientFrom || settings.bgGradientTo) return "";
  const root = "#section-" + String(sectionId).replace(/[^a-zA-Z0-9_-]/g, "");
  const src = String(settings[FIELD]);
  const tablet = pick(copies, TABLET_MIN_WIDTH), phone = pick(copies, PHONE_MIN_WIDTH);
  let css = "";
  if (tablet.url !== src) css += `@media${UP_TO.tablet}{${root}{--fm-bg-img:${cssUrl(tablet.url)};}}`;
  if (phone.url !== src && phone.url !== tablet.url) css += `@media${UP_TO.mobile}{${root}{--fm-bg-img:${cssUrl(phone.url)};}}`;
  return css;
}
