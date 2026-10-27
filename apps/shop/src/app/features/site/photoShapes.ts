// Photo shapes. Two independent choices, both Studio › Style controls:
//  • proportions — the width : height of the photo box ("Image shape" / "Photo shape", e.g. 3:4, 21:9);
//  • outline — the silhouette the photo is cut to ("Photo outline": arch, circle, hexagon…).
// Outlines are emitted as one CSS rule per surface (see StorefrontOverrides) so the shop grid, the
// product page and the Studio preview all obey them. Default = no rule, so existing looks are untouched.

export const PHOTO_RATIOS: { value: string; label: string }[] = [
  { value: "9:16", label: "9:16 · Story / phone screen" },
  { value: "1:2", label: "1:2 · Extra tall" },
  { value: "4:7", label: "4:7 · Very tall" },
  { value: "9:14", label: "9:14 · Slim paperback" },
  { value: "3:5", label: "3:5 · Tall paperback" },
  { value: "5:8", label: "5:8 · Trade paperback" },
  { value: "2:3", label: "2:3 · Tall portrait" },
  { value: "7:10", label: "7:10 · Hardcover" },
  { value: "5:7", label: "5:7 · Print portrait" },
  { value: "8:11", label: "8:11 · Letter page" },
  { value: "3:4", label: "3:4 · Portrait" },
  { value: "4:5", label: "4:5 · Book cover" },
  { value: "5:6", label: "5:6 · Slight portrait" },
  { value: "1:1", label: "1:1 · Square" },
  { value: "6:5", label: "6:5 · Slight landscape" },
  { value: "5:4", label: "5:4 · Almost square, wide" },
  { value: "4:3", label: "4:3 · Landscape" },
  { value: "11:8", label: "11:8 · Letter page, wide" },
  { value: "7:5", label: "7:5 · Print landscape" },
  { value: "10:7", label: "10:7 · Open book / flat lay" },
  { value: "3:2", label: "3:2 · Photo landscape" },
  { value: "8:5", label: "8:5 · Wide photo (16:10)" },
  { value: "5:3", label: "5:3 · Wide landscape" },
  { value: "16:9", label: "16:9 · Widescreen" },
  { value: "2:1", label: "2:1 · Banner" },
  { value: "21:9", label: "21:9 · Panorama" },
  { value: "12:5", label: "12:5 · Cinema" },
  { value: "3:1", label: "3:1 · Wide banner" },
  { value: "4:1", label: "4:1 · Strip" },
];

type Outline = { label: string; radius?: string; clip?: string };

/** `default` = no override (the normal corner-radius setting applies). */
export const PHOTO_OUTLINES: Record<string, Outline> = {
  default: { label: "Normal (use the corner radius setting)" },
  arch: { label: "Arch (round top)", radius: "999px 999px 0 0" },
  window: { label: "Window (round top, soft bottom)", radius: "999px 999px 24px 24px" },
  pill: { label: "Pill (fully rounded ends)", radius: "999px" },
  circle: { label: "Circle / oval", radius: "50%" },
  leaf: { label: "Leaf (two opposite round corners)", radius: "0 999px 0 999px" },
  hexagon: { label: "Hexagon", clip: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)" },
  octagon: { label: "Octagon", clip: "polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)" },
  diamond: { label: "Diamond", clip: "polygon(50% 0,100% 50%,50% 100%,0 50%)" },
  chamfer: { label: "Cut corners", clip: "polygon(0 0,calc(100% - 28px) 0,100% 28px,100% 100%,28px 100%,0 calc(100% - 28px))" },
  slant: { label: "Slanted sides", clip: "polygon(8% 0,100% 0,92% 100%,0 100%)" },
};

export const PHOTO_OUTLINE_OPTIONS = Object.entries(PHOTO_OUTLINES).map(([value, o]) => ({ value, label: o.label }));
export const PHOTO_RATIO_OPTIONS = PHOTO_RATIOS.map((r) => ({ value: r.value, label: r.label }));

function rule(selector: string, key: unknown): string {
  const o = typeof key === "string" ? PHOTO_OUTLINES[key] : undefined;
  if (!o || key === "default") return "";
  const body = (o.radius ? `border-radius:${o.radius} !important;` : "") + (o.clip ? `clip-path:${o.clip} !important;border-radius:0 !important;` : "") + "overflow:hidden !important;";
  return `${selector}{${body}}`;
}

/** Shop-grid cards use `fm-photo-frame`; the product page photos use `fm-photo-frame-pdp`. */
export function photoOutlineCss(design: any): string {
  const d = design || {};
  const pdp = d.productPhotoOutline && d.productPhotoOutline !== "grid" ? d.productPhotoOutline : d.photoOutline;
  return rule(".fm-photo-frame", d.photoOutline) + rule(".fm-photo-frame-pdp", pdp);
}
