import type { OptionItem } from "./sectionStyleHelpers";

/**
 * Named "Shape & pattern" controls (Studio › section › Effects). Starter sites
 * use these instead of hidden custom code, so every starter's look stays
 * clickable and editable in the designer.
 */
export const BG_PATTERN_OPTIONS: OptionItem[] = [
  { value: "", label: "None" },
  { value: "glow", label: "Soft glow from the top" },
  { value: "dots", label: "Halftone dots" },
  { value: "gingham", label: "Gingham check" },
  { value: "stripes", label: "Stripes" },
  { value: "grid", label: "Fine grid" },
];

export const TILT_OPTIONS: OptionItem[] = [
  { value: "", label: "Straight" },
  { value: "-2", label: "Tilt left (more)" },
  { value: "-1", label: "Tilt left" },
  { value: "1", label: "Tilt right" },
  { value: "2", label: "Tilt right (more)" },
];

export const PANEL_FILL_OPTIONS: OptionItem[] = [
  { value: "", label: "None" },
  { value: "box", label: "Box fill" },
  { value: "raised", label: "Raised box fill" },
];

const PATTERNS: Record<string, string> = {
  glow: "background-image:radial-gradient(60% 90% at 50% 0%,color-mix(in srgb,var(--accent) 38%,transparent),transparent 70%)",
  dots: "background-image:radial-gradient(var(--pattern-ink,rgba(0,0,0,.2)) 1.6px,transparent 1.7px);background-size:14px 14px",
  gingham: "background-image:repeating-linear-gradient(0deg,var(--pattern-ink,rgba(255,255,255,.55)) 0 24px,transparent 24px 48px),repeating-linear-gradient(90deg,var(--pattern-ink,rgba(255,255,255,.55)) 0 24px,transparent 24px 48px)",
  stripes: "background-image:repeating-linear-gradient(135deg,var(--pattern-ink,rgba(0,0,0,.08)) 0 12px,transparent 12px 24px)",
  grid: "background-image:linear-gradient(var(--pattern-ink,rgba(0,0,0,.08)) 1px,transparent 1px),linear-gradient(90deg,var(--pattern-ink,rgba(0,0,0,.08)) 1px,transparent 1px);background-size:24px 24px",
};

const num = (v: unknown, min: number, max: number): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
};
const safeColor = (v: unknown) => (typeof v === "string" && v && !/[;{}<>]/.test(v) ? v : "");

/** CSS for one section's shape & pattern settings; "" when none are set. */
export function sectionShapeCss(sectionId: string, s: any): string {
  const root = "#section-" + String(sectionId).replace(/[^a-zA-Z0-9_-]/g, "");
  const decl: string[] = [];
  const pattern = PATTERNS[s?.bgPattern];
  if (pattern) decl.push(pattern);
  if (pattern && safeColor(s?.patternColor)) decl.push(`--pattern-ink:${safeColor(s.patternColor)}`);
  const outline = num(s?.outlineWidth, 0, 16);
  if (outline) decl.push(`border:${outline}px solid ${safeColor(s?.outlineColor) || "currentColor"}`);
  const tilt = num(s?.tilt, -3, 3);
  if (tilt) decl.push(`transform:rotate(${tilt}deg)`);
  const gap = num(s?.outerGap, 0, 96);
  if (gap) decl.push(`margin-top:${gap}px`, `margin-bottom:${gap}px`, `margin-left:${gap}px`, `margin-right:${gap}px`);
  const width = num(s?.boxMaxWidth, 0, 2400);
  if (width) decl.push(`max-width:${width}px`, "margin-left:auto", "margin-right:auto");
  const overlap = num(s?.overlapAbove, 0, 240);
  if (overlap) decl.push(`margin-top:-${overlap}px`, "position:relative", "z-index:1");
  if (s?.panelFill === "box") decl.push("background:var(--surface)");
  if (s?.panelFill === "raised") decl.push("background:var(--surface-2)");
  let css = decl.length ? `${root}{${decl.join(";")}}` : "";
  const lh = num(s?.headingLineHeight, 0.7, 2);
  if (lh) css += `${root} :is(h1,h2){line-height:${lh}!important}`;
  return css;
}
