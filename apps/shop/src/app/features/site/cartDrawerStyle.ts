// The shopping bag (components/CartDrawer.tsx) — a Riso "order slip": ruled header, numbered line
// items, a squared free-shipping meter, an outlined upsell card and a summary ledger above the
// checkout button. Every value comes from a Studio › Style › "Cart drawer (shopping bag)" control
// (the `cartDrawer*` design keys); an empty control falls back to a theme token, so the bag always
// follows the palette. CartDrawer opts elements in with these class names:
//   fm-bag            drawer panel               fm-bag-head / -title / -close   header row
//   fm-bag-meta       small mono labels          fm-bag-rule                     ruled divider
//   fm-bag-meter / -track / -fill   free-shipping meter
//   fm-bag-item / -num / -thumb / -name / -line  one line item
//   fm-bag-qty / -qty-btn            quantity stepper (data-style="boxes" | "pill")
//   fm-bag-remove     remove button              fm-bag-upsell / -upsell-btn     upsell card
//   fm-bag-summary / -row / -total   summary ledger
//   fm-bag-badges     trust badges               fm-bag-cta                      checkout button

import { elementScheme } from "./colorSchemes";

const S = ".fm-bag";
const clean = (v: any) => String(v).replace(/[;{}<>]/g, "");
const font = (name: any) => `'${String(name).replace(/['"\\;{}<>]/g, "")}', sans-serif`;
const has = (v: any) => v !== undefined && v !== null && v !== "";

function num(d: any, key: string, fallback: number, min: number, max: number): number {
  const x = Number(d[key]);
  if (!has(d[key]) || !Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}
const color = (d: any, key: string, fallback: string) => (has(d[key]) ? clean(d[key]) : fallback);

/** Panel width in px (also used by the drawer's inline max-width). */
export const cartDrawerWidth = (design: any) => num(design || {}, "cartDrawerWidth", 460, 320, 640);

/** Google fonts the bag's font controls ask for. */
export function cartDrawerFontNames(design: any): string[] {
  const d = design || {};
  return [d.cartDrawerTitleFont, d.cartDrawerMetaFont].filter((n) => has(n)).map(String);
}

export function cartDrawerCss(design: any): string {
  const d = design || {};
  // Theme settings › Colour schemes › Shopping bag: while the bag follows a scheme, the scheme's
  // colours (set as tokens on .fm-bag by schemeCss) replace the bag's own colour controls.
  const schemed = Boolean(elementScheme(d, "cartDrawer"));
  const tint = (key: string, fallback: string) => (schemed ? fallback : color(d, key, fallback));
  const bg = tint("cartDrawerBg", "var(--bg-color, Canvas)");
  const fg = tint("cartDrawerText", "rgb(var(--fg-rgb))");
  const muted = tint("cartDrawerMuted", "var(--muted, currentColor)");
  const surface = tint("cartDrawerSurface", "var(--surface, transparent)");
  const rule = tint("cartDrawerBorder", "rgba(var(--fg-rgb), 0.18)");
  const edge = tint("cartDrawerEdgeColor", "var(--rp-outline, rgb(var(--fg-rgb)))");
  const edgeW = has(d.cartDrawerEdgeWidth) ? `${num(d, "cartDrawerEdgeWidth", 2, 0, 6)}px` : "var(--rp-outline-w, 2px)";
  const shadow = tint("cartDrawerShadowColor", "var(--accent)");
  const shadowX = num(d, "cartDrawerShadowOffset", 6, 0, 16);
  const left = d.cartDrawerSide === "left";
  const pad = num(d, "cartDrawerPadding", 28, 12, 48);
  const titleFont = has(d.cartDrawerTitleFont) ? font(d.cartDrawerTitleFont) : "var(--heading-font, inherit)";
  const titleSize = num(d, "cartDrawerTitleSize", 32, 18, 56);
  const titleCase = d.cartDrawerTitleCase === "none" ? "none" : "uppercase";
  const metaFont = font(has(d.cartDrawerMetaFont) ? d.cartDrawerMetaFont : "DM Mono");
  const metaSize = num(d, "cartDrawerMetaSize", 11, 8, 14);
  const thumbW = num(d, "cartDrawerThumbWidth", 72, 48, 128);
  const thumbOutline = d.cartDrawerThumbOutline ?? true;
  const itemSize = num(d, "cartDrawerItemTitleSize", 14, 10, 20);
  const track = tint("cartDrawerProgressTrack", "rgba(var(--fg-rgb), 0.12)");
  const fill = tint("cartDrawerProgressColor", "var(--accent)");
  const meterH = num(d, "cartDrawerProgressHeight", 6, 2, 12);
  const upsellShadow = d.cartDrawerUpsellShadow ?? true;
  const totalSize = num(d, "cartDrawerTotalSize", 32, 18, 56);
  const solid = (d.buttonStyle || "solid") === "solid";
  const ctaBg = schemed ? "var(--btn-bg, var(--accent))" : color(d, "cartDrawerCheckoutBg", has(d.buttonColor) ? clean(d.buttonColor) : "var(--accent)");
  const ctaText = schemed ? "var(--btn-text, var(--on-accent))" : color(d, "cartDrawerCheckoutText", has(d.buttonTextColor) ? clean(d.buttonTextColor) : "var(--on-accent, rgb(var(--fg-rgb)))");
  const ctaH = num(d, "cartDrawerCheckoutHeight", 56, 40, 80);
  const ctaShadow = d.cartDrawerCheckoutShadow ?? true;
  const radius = has(d.buttonRadius) ? `${num(d, "buttonRadius", 0, 0, 999)}px` : "var(--rp-card-radius, 0px)";
  const upper = (d.buttonUppercase ?? true) ? "uppercase" : "none";

  const edgeSide = left ? "right" : "left";
  const shadowDir = left ? shadowX : -shadowX;

  return [
    `${S}{background:${bg};color:${fg};border-${edgeSide}:${edgeW} solid ${edge};box-shadow:${shadowDir}px 0 0 ${shadow};--bag-pad:${pad}px;--bag-rule:${rule};--bag-muted:${muted};--bag-surface:${surface};--bag-edge:${edge};--bag-edge-w:${edgeW};}`,
    `${S} .fm-bag-pad{padding-left:var(--bag-pad);padding-right:var(--bag-pad);}`,
    `${S} .fm-bag-meta{font-family:${metaFont};font-size:${metaSize}px;letter-spacing:.12em;text-transform:uppercase;color:var(--bag-muted);}`,
    `${S} .fm-bag-rule{border-color:var(--bag-rule);}`,
    `${S} .fm-bag-title{font-family:${titleFont};font-size:${titleSize}px;line-height:.95;text-transform:${titleCase};letter-spacing:.01em;margin:0;}`,
    `${S} .fm-bag-close{border:var(--bag-edge-w) solid var(--bag-edge);background:transparent;color:inherit;}`,
    `${S} .fm-bag-close:hover{background:${fg};color:${bg};}`,
    `${S} .fm-bag-track{height:${meterH}px;background:${track};border:1px solid var(--bag-rule);overflow:hidden;}`,
    `${S} .fm-bag-fill{height:100%;background:${fill};transition:width .5s;}`,
    `${S} .fm-bag-fill[data-done]{background:var(--success, ${fill});}`,
    `${S} .fm-bag-item + .fm-bag-item{border-top:1px solid var(--bag-rule);}`,
    `${S} .fm-bag-num{font-family:${metaFont};font-size:${metaSize}px;color:var(--bag-muted);min-width:2ch;}`,
    `${S} .fm-bag-thumb{width:${thumbW}px;aspect-ratio:3/4;flex-shrink:0;overflow:hidden;background:var(--bag-surface);${thumbOutline ? "outline:var(--bag-edge-w) solid var(--bag-edge);outline-offset:-1px;" : ""}}`,
    `${S} .fm-bag-name{font-family:${titleFont};font-size:${itemSize}px;line-height:1.1;text-transform:${titleCase};margin:0;}`,
    `${S} .fm-bag-line{font-family:${titleFont};font-size:${itemSize}px;white-space:nowrap;}`,
    `${S} .fm-bag-was{color:var(--bag-muted);text-decoration:line-through;font-size:.8em;margin-right:.5em;}`,
    `${S} .fm-bag-saving{color:var(--success, ${fg});}`,
    `${S} .fm-bag-input{background:var(--bag-surface);color:inherit;border:1px solid var(--bag-edge);padding:10px;font:inherit;font-size:${Math.max(16, metaSize + 2)}px;min-height:44px;}`,
    `${S} .fm-bag-qty{display:inline-flex;align-items:stretch;}`,
    `${S} .fm-bag-qty[data-style="boxes"]{border:var(--bag-edge-w) solid var(--bag-edge);}`,
    `${S} .fm-bag-qty[data-style="boxes"] .fm-bag-qty-n{border-left:1px solid var(--bag-rule);border-right:1px solid var(--bag-rule);}`,
    `${S} .fm-bag-qty[data-style="pill"]{background:var(--bag-surface);border-radius:999px;}`,
    `${S} .fm-bag-qty-btn{background:transparent;color:inherit;}`,
    `${S} .fm-bag-qty-btn:not(:disabled):hover{background:${fg};color:${bg};}`,
    `${S} .fm-bag-qty-n{font-family:${metaFont};font-size:${metaSize + 2}px;min-width:2.5em;display:flex;align-items:center;justify-content:center;}`,
    `${S} .fm-bag-remove{color:var(--bag-muted);background:transparent;text-decoration:underline;text-underline-offset:3px;}`,
    `${S} .fm-bag-remove:hover{color:var(--danger, ${fg});}`,
    `${S} .fm-bag-warn{color:var(--low-inventory-color, var(--danger, currentColor));}`,
    `${S} .fm-bag-upsell{background:var(--bag-surface);border:var(--bag-edge-w) solid var(--bag-edge);${upsellShadow ? `box-shadow:var(--rp-shadow-x, 4px) var(--rp-shadow-x, 4px) 0 ${shadow};` : ""}}`,
    `${S} .fm-bag-upsell-btn,${S} .fm-bag-cta{font-family:${metaFont};text-transform:${upper};letter-spacing:.14em;border-radius:${radius};${solid ? `background:${ctaBg};color:${ctaText};border:var(--bag-edge-w) solid var(--bag-edge);` : `background:transparent;color:${ctaBg};border:var(--bag-edge-w) solid ${ctaBg};`}}`,
    `${S} .fm-bag-cta{min-height:${ctaH}px;font-size:${metaSize + 2}px;font-weight:700;${ctaShadow ? `box-shadow:var(--rp-shadow-x, 4px) var(--rp-shadow-x, 4px) 0 var(--bag-edge);` : ""}transition:transform .15s, box-shadow .15s;}`,
    `${S} .fm-bag-cta:not(:disabled):hover{transform:translate(-2px,-2px);}`,
    `${S} .fm-bag-upsell-btn{font-size:${Math.max(9, metaSize - 1)}px;font-weight:700;}`,
    // Suggestion card: a long title (often one word, like SISTEMA_NON_AUTORIZZATO) breaks onto new lines inside
    // its own column and stops at three lines, so it never runs under the Add button.
    `${S} .fm-bag-upsell-name{overflow-wrap:anywhere;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;}`,
    `${S} .fm-bag-summary{border-top:var(--bag-edge-w) solid var(--bag-edge);background:${bg};}`,
    `${S} .fm-bag-row{display:flex;justify-content:space-between;gap:1rem;align-items:baseline;}`,
    `${S} .fm-bag-total{border-top:1px solid var(--bag-rule);}`,
    `${S} .fm-bag-total-n{font-family:${titleFont};font-size:${totalSize}px;line-height:1;}`,
    `${S} .fm-bag-badges > *{border:1px solid var(--bag-rule);}`,
    `${S} .fm-bag-empty-icon{border:var(--bag-edge-w) solid var(--bag-edge);color:var(--bag-muted);}`,
  ].join("");
}
