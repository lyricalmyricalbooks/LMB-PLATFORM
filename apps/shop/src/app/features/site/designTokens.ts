// Design scales (Studio 3.0 phase 2): shared values the whole shop draws from, set once in
// Studio › Theme settings › Design scales. Like Stripe's Appearance API the layers are: a theme preset,
// then these shared values, then each section's own settings (which always win). Every scale is off
// until the owner turns it on, so an unset design renders exactly as before.
//
// CSS variables (on [data-fm-store]):
//   --fm-step-0 … --fm-step-5   heading sizes from the type scale (fluid between phone and desktop)
//   --fm-space-unit, --fm-space-scale   spacing unit and the phone multiplier; a step = unit × n × scale
//   --fm-radius-s/m/l           corner set (card shadows stay with Effects › Card shadow depth)
import { UP_TO } from "./breakpoints";

const S = "[data-fm-store]";
/** Doubled to outrank the token sheet's own focus rules without !important. */
const SS = `${S}${S}`;

export const TYPE_SCALES: { value: string; label: string; ratio: number }[] = [
  { value: "minor-third", label: "Gentle (1.2×)", ratio: 1.2 },
  { value: "major-third", label: "Balanced (1.25×)", ratio: 1.25 },
  { value: "perfect-fourth", label: "Bold (1.333×)", ratio: 1.333 },
  { value: "golden", label: "Dramatic (1.618×)", ratio: 1.618 },
];

/** Section spacing steps (in spacing units). */
export const SPACE_STEPS: { value: string; label: string; units: number }[] = [
  { value: "xs", label: "Extra small", units: 2 },
  { value: "s", label: "Small", units: 4 },
  { value: "m", label: "Medium", units: 8 },
  { value: "l", label: "Large", units: 12 },
  { value: "xl", label: "Extra large", units: 16 },
];

export const RADIUS_SCALES: Record<string, { label: string; s: number; m: number; l: number }> = {
  sharp: { label: "Sharp (0 · 2 · 4 px)", s: 0, m: 2, l: 4 },
  soft: { label: "Soft (4 · 8 · 16 px)", s: 4, m: 8, l: 16 },
  round: { label: "Round (10 · 18 · 28 px)", s: 10, m: 18, l: 28 },
};


const PHONE_W = 390, DESKTOP_W = 1200;
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== "" && v != null ? Math.max(min, Math.min(max, n)) : fallback;
};
const round = (n: number) => Math.round(n * 100) / 100;

export type TypeStep = { step: number; desktop: number; phone: number; css: string };

/** Heading sizes for steps 0–5, or [] while the type scale is off. */
export function typeSteps(design: any): TypeStep[] {
  const d = design || {};
  const scale = TYPE_SCALES.find(t => t.value === d.typeScale);
  if (!scale) return [];
  const base = num(d.typeScaleBase, 16, 12, 24);
  const fluid = d.typeScaleFluid !== false;
  // Phones use a gentler ratio, so big headings shrink more than small ones.
  const phoneRatio = 1 + (scale.ratio - 1) * 0.6;
  return [0, 1, 2, 3, 4, 5].map(step => {
    const desktop = round(base * scale.ratio ** step);
    const phone = fluid ? round(base * phoneRatio ** step) : desktop;
    if (phone === desktop) return { step, desktop, phone, css: `${desktop}px` };
    const slope = (desktop - phone) / (DESKTOP_W - PHONE_W);
    const intercept = round(phone - slope * PHONE_W);
    return { step, desktop, phone, css: `clamp(${phone}px, calc(${intercept}px + ${round(slope * 100)}vw), ${desktop}px)` };
  });
}

/** Spacing unit and phone multiplier (always defined: steps are opt-in per section). */
export function spaceUnits(design: any) {
  const d = design || {};
  return { unit: num(d.spaceUnit, 8, 2, 16), phoneScale: num(d.phoneSpaceScale, 75, 40, 100) / 100 };
}

/** The padding a section's spacing step means, as CSS, or "" for an unknown step. */
export function spaceStepCss(step: unknown): string {
  const hit = SPACE_STEPS.find(s => s.value === step);
  return hit ? `calc(var(--fm-space-unit, 8px) * ${hit.units} * var(--fm-space-scale, 1))` : "";
}

/** Padding rules for a section that uses a spacing step. Plain (not !important) rules, so a typed padding
 *  number (inline) and Studio's per-device spacing overrides (!important) still win. */
export function sectionStepCss(sectionId: string, step: unknown): string {
  const value = spaceStepCss(step);
  if (!value) return "";
  const root = "#section-" + String(sectionId).replace(/[^a-zA-Z0-9_-]/g, "");
  return `${root}:not(:has([data-studio-spacing])),${root} [data-studio-spacing]{padding-top:${value};padding-bottom:${value};}`;
}

/** Style › Animations & hover effects › Book card shadow: off unless chosen; hover lifts one step. */
export const CARD_SHADOWS: Record<string, string> = {
  subtle: "0 1px 2px 0 rgba(var(--overlay-rgb, 0, 0, 0), 0.08)",
  medium: "0 4px 6px -1px rgba(var(--overlay-rgb, 0, 0, 0), 0.12), 0 2px 4px -2px rgba(var(--overlay-rgb, 0, 0, 0), 0.12)",
  raised: "0 10px 15px -3px rgba(var(--overlay-rgb, 0, 0, 0), 0.14), 0 4px 6px -4px rgba(var(--overlay-rgb, 0, 0, 0), 0.14)",
  dramatic: "0 25px 50px -12px rgba(var(--overlay-rgb, 0, 0, 0), 0.3)",
};
const SHADOW_STEPS = ["subtle", "medium", "raised", "dramatic"];

export function designTokensCss(design: any): string {
  const d = design || {};
  const { unit, phoneScale } = spaceUnits(d);
  const vars: string[] = [`--fm-space-unit:${unit}px`, "--fm-space-scale:1"];
  const steps = typeSteps(d);
  for (const s of steps) vars.push(`--fm-step-${s.step}:${s.css}`);
  const radius = RADIUS_SCALES[d.radiusScale];
  if (radius) vars.push(`--fm-radius-s:${radius.s}px`, `--fm-radius-m:${radius.m}px`, `--fm-radius-l:${radius.l}px`, `--rp-card-radius:${radius.m}px`);

  let css = `${S}{${vars.join(";")};}`;
  if (phoneScale !== 1) css += `@media${UP_TO.mobile}{${S}{--fm-space-scale:${phoneScale};}}`;
  // Layout & spacing › Space between sections: every section after the first in a stack.
  const gap = num(d.sectionGap, 0, 0, 160);
  if (gap > 0) css += `${S} [data-fm-section]+[data-fm-section]{margin-top:calc(${gap}px * var(--fm-space-scale, 1));}`;
  const shadow = CARD_SHADOWS[d.cardShadowDepth];
  if (shadow) {
    const lift = CARD_SHADOWS[SHADOW_STEPS[Math.min(SHADOW_STEPS.indexOf(d.cardShadowDepth) + 1, SHADOW_STEPS.length - 1)]];
    css += `${S} .fm-card{box-shadow:${shadow} !important;transition:box-shadow .2s ease;}${S} .fm-card:hover{box-shadow:${lift} !important;}`;
  }
  // Section headings follow the scale; a section's own heading size (#section-… rules) still wins.
  if (steps.length) {
    css += `${S} [data-fm-section] h1{font-size:var(--fm-step-5);}`
      + `${S} [data-fm-section] h2{font-size:var(--fm-step-4);}`
      + `${S} [data-fm-section] h3{font-size:var(--fm-step-3);}`
      + `${S} [data-fm-section] h4{font-size:var(--fm-step-2);}`;
  }
  // State rules: focus ring, focused fields and pressed buttons.
  // The ring's colour is Riso print treatment › Keyboard focus ring (--rp-focus); this sets its width.
  if (d.focusRingWidth != null && d.focusRingWidth !== "") {
    const width = num(d.focusRingWidth, 2, 1, 6);
    css += `${SS} :where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:${width}px solid var(--rp-focus);outline-offset:2px;}`;
  }
  if (d.inputFocusColor) css += `${SS} :is(input,select,textarea):focus-visible{border-color:${d.inputFocusColor} !important;}`;
  if (d.buttonPress === "shrink" || d.buttonPress === "sink") {
    const effect = d.buttonPress === "shrink" ? "transform:scale(.97)" : "transform:translate(2px,2px);box-shadow:none";
    css += `@media (prefers-reduced-motion: no-preference){${S} button:not(:disabled):active{${effect};}}`;
  }
  return css;
}
