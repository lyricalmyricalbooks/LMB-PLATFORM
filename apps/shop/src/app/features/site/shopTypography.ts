// Studio › Theme settings › Typography › Line height and Letter spacing, on every storefront page.
// Most shop text carries a Tailwind size or tracking class (text-sm, tracking-widest…) that sets its
// own line height / letter spacing, so a value set only on the page root reached almost nothing.
// These rules move Tailwind's own scale with the control instead: at the default (1.6, Normal)
// nothing is emitted and every page looks exactly as before; any other value moves every line
// proportionally, keeping each size's relative rhythm. Arbitrary values (leading-[1.8]) and the
// part-specific controls (card title, description, Fine-tune one element) keep their own.

export const DEFAULT_LINE_HEIGHT = 1.6;

// Tailwind v4's default theme (node_modules/tailwindcss/theme.css).
const TEXT_LINE_HEIGHTS: Record<string, number> = {
  xs: 1 / 0.75, sm: 1.25 / 0.875, base: 1.5, lg: 1.75 / 1.125, xl: 1.75 / 1.25, "2xl": 2 / 1.5,
  "3xl": 2.25 / 1.875, "4xl": 2.5 / 2.25, "5xl": 1, "6xl": 1, "7xl": 1, "8xl": 1, "9xl": 1,
};
const LEADING: Record<string, number> = { tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2 };
const TRACKING: Record<string, number> = { tighter: -0.05, tight: -0.025, normal: 0, wide: 0.025, wider: 0.05, widest: 0.1 };

/** Extra letter spacing (em) for the Typography › Letter spacing choice. */
export function trackingEm(letterSpacing: unknown): number {
  return letterSpacing === "ultra" ? 0.08 : letterSpacing === "wide" ? 0.03 : 0;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export function shopTypographyCss(design: any): string {
  const rules: string[] = [];
  const lh = Number(design?.lineHeight);
  if (design?.lineHeight != null && design?.lineHeight !== "" && Number.isFinite(lh) && lh > 0 && round(lh) !== DEFAULT_LINE_HEIGHT) {
    const ratio = lh / DEFAULT_LINE_HEIGHT;
    rules.push(`line-height:${round(lh)};`);
    for (const [k, v] of Object.entries(TEXT_LINE_HEIGHTS)) rules.push(`--text-${k}--line-height:${round(v * ratio)};`);
    for (const [k, v] of Object.entries(LEADING)) rules.push(`--leading-${k}:${round(v * ratio)};`);
  }
  const extra = trackingEm(design?.letterSpacing);
  if (extra) {
    rules.push(`letter-spacing:${extra}em;`);
    for (const [k, v] of Object.entries(TRACKING)) rules.push(`--tracking-${k}:${round(v + extra)}em;`);
  }
  return rules.length ? `[data-fm-store]{${rules.join("")}}` : "";
}
