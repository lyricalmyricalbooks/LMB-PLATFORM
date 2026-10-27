// The checkout page (Checkout.tsx) — a Riso "order slip": a ruled header, one form with lettered
// sections (A Contact · B Ship to · C Delivery · D Pay), labels above square fields, delivery and
// payment as outlined choice lists, a flare Pay button with an offset shadow and, beside it, an
// outlined "Order slip" panel with numbered lines, a perforated code box, a ledger and a big total.
// On phones the slip folds into a bar at the top and the Pay button is pinned to the bottom.
//
// Every value comes from a Studio › Style › "Checkout page" control (the `checkout*` design keys);
// an empty control falls back to a theme token, so the page always follows the palette. Words are
// Studio › Text & labels › Checkout. Checkout.tsx opts elements in with these class names:
//   fm-co               page root (with data-fm-checkout)    fm-co-mono      small mono labels
//   fm-co-header / -brand / -brand-accent / -back / -secure  header row
//   fm-co-grid / -form / -title                              two columns, the form, "Checkout"
//   fm-co-section / -section-head / -marker / -h2 / -tag     a lettered section
//   fm-co-field / -label / -input / -select                  labels-above fields
//   fm-co-choices / -choice / -choice-*  / fm-co-seg         delivery (and list-style payment) choices
//   fm-co-pay / -pay-tab / -pay-body                         payment choices (tabs or list)
//   fm-co-paybtn / -paybtn-main / -fine                      Pay button and the line under it
//   fm-co-slip / -slip-head / -lines / -line / -codes / -ledger / -total / -slip-foot   the slip
//   fm-co-slipbar       phone/tablet bar that opens the slip
//   fm-co-paybar        phone Pay bar pinned to the bottom

import { PHONE_MAX, TABLET_MAX } from "./breakpoints";

const P = "[data-fm-checkout].fm-co";
const clean = (v: any) => String(v).replace(/[;{}<>]/g, "");
const font = (name: any) => `'${String(name).replace(/['"\\;{}<>]/g, "")}', sans-serif`;
const has = (v: any) => v !== undefined && v !== null && v !== "";

function num(d: any, key: string, fallback: number, min: number, max: number): number {
  const x = Number(d[key]);
  if (!has(d[key]) || !Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}
const color = (d: any, key: string, fallback: string) => (has(d[key]) ? clean(d[key]) : fallback);

/** Labels above the boxes (order slip, the default) or inside them (the earlier floating labels). */
export const checkoutLabelsAbove = (design: any) => (design?.checkoutLabelStyle || "stacked") !== "floating";

/** Payment choices side by side as tabs (default) or as a stacked list. */
export const checkoutPayTabs = (design: any) => (design?.checkoutPayTabs || "tabs") !== "list";

/** The phone Pay bar pinned to the bottom of the screen. */
export const checkoutPayBarOn = (design: any) => design?.checkoutPhonePayBar ?? true;

/** The small marker before each section heading: A, B, C… (default), 01, 02… or none. */
export function checkoutMarker(design: any, index: number): string | null {
  const style = design?.checkoutSectionMarker || "letters";
  if (style === "none") return null;
  if (style === "numbers") return String(index + 1).padStart(2, "0");
  return String.fromCharCode(65 + index);
}

/** The shop name with its last word split off, so it can take the accent colour. */
export function splitBrand(name: string): [string, string] {
  const text = String(name || "").trim();
  const at = text.lastIndexOf(" ");
  return at > 0 ? [text.slice(0, at), text.slice(at + 1)] : ["", text];
}

/** Google fonts the checkout's own font controls ask for. */
export function checkoutSlipFontNames(design: any): string[] {
  const d = design || {};
  return [has(d.checkoutMetaFont) ? d.checkoutMetaFont : "DM Mono"].map(String);
}

export function checkoutSlipCss(design: any): string {
  const d = design || {};
  const fg = "rgb(var(--fg-rgb))";
  const muted = "rgba(var(--fg-rgb), .64)";
  const rule = color(d, "checkoutRuleColor", "rgba(var(--fg-rgb), .22)");
  const accent = "var(--accent)";
  const head = has(d.checkoutHeadingFont) ? font(d.checkoutHeadingFont) : "var(--heading-font, inherit)";
  const meta = font(has(d.checkoutMetaFont) ? d.checkoutMetaFont : "DM Mono");
  const fieldBg = color(d, "checkoutFieldBg", "var(--surface, rgba(var(--fg-rgb), .05))");
  const fieldText = color(d, "checkoutFieldText", "inherit");
  const fieldBorder = color(d, "checkoutFieldBorder", "rgba(var(--fg-rgb), .32)");
  const fieldH = num(d, "checkoutFieldHeight", 48, 40, 64);
  const radius = `${num(d, "checkoutInputRadius", 0, 0, 24)}px`;
  const headerRule = num(d, "checkoutHeaderRuleWidth", 2, 0, 6);
  const titleSize = num(d, "checkoutPageTitleSize", 64, 32, 96);
  const sectionSize = num(d, "checkoutSectionTitleSize", 24, 16, 40);
  const marker = color(d, "checkoutMarkerColor", accent);
  const payBg = color(d, "checkoutPayBg", has(d.buttonColor) ? clean(d.buttonColor) : accent);
  const payText = color(d, "checkoutPayText", has(d.buttonTextColor) ? clean(d.buttonTextColor) : "var(--on-accent, #100f0d)");
  const payH = num(d, "checkoutPayHeight", 64, 48, 80);
  const payShadow = (d.checkoutPayShadow ?? true) ? `4px 4px 0 ${color(d, "checkoutPayShadowColor", fg)}` : "none";
  const slipBg = color(d, "checkoutSlipBg", "var(--bg-color, Canvas)");
  const slipEdge = color(d, "checkoutSlipOutline", fg);
  const slipW = num(d, "checkoutSlipOutlineWidth", 2, 0, 6);
  const slipShadowColor = color(d, "checkoutSlipShadowColor", accent);
  const slipShadowX = num(d, "checkoutSlipShadowOffset", 8, 0, 16);
  const slipTitle = num(d, "checkoutSlipTitleSize", 40, 20, 64);
  const thumbW = num(d, "checkoutSlipThumbWidth", 72, 48, 120);
  const perforated = d.checkoutSlipPerforation ?? true;
  const totalSize = num(d, "checkoutSlipTotalSize", 40, 24, 64);
  const footBg = color(d, "checkoutSlipFooterBg", accent);
  const footText = color(d, "checkoutSlipFooterText", "var(--on-accent, #100f0d)");
  const phone = `@media (max-width:${PHONE_MAX}px)`;
  const narrow = `@media (max-width:${TABLET_MAX}px)`;
  const wide = `@media (min-width:${TABLET_MAX + 1}px)`;
  const shadow = (x: number, c: string) => (x > 0 ? `${x}px ${x}px 0 ${c}` : "none");

  return [
    `${P}{--co-fg:${fg};--co-muted:${muted};--co-rule:${rule};--co-head:${head};--co-meta:${meta};--co-field-bg:${fieldBg};--co-field-border:${fieldBorder};--co-edge:${slipEdge};}`,
    `${P} .fm-co-mono{font-family:var(--co-meta);font-size:12px;line-height:16px;letter-spacing:.12em;text-transform:uppercase;font-weight:400;}`,
    `${P} .fm-co-muted{color:var(--co-muted);}`,
    // Header
    `${P} .fm-co-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;height:72px;padding:0 clamp(16px, 8vw, 120px);border-bottom:${headerRule}px solid ${fg};background:transparent;}`,
    `${P} .fm-co-back{display:inline-flex;align-items:center;gap:8px;min-height:44px;color:${fg};text-decoration:none;justify-self:start;}`,
    `${P} .fm-co-brand{font-family:var(--co-head);font-size:28px;line-height:32px;text-transform:uppercase;letter-spacing:.01em;color:${fg};text-decoration:none;text-align:center;font-weight:400;}`,
    `${P} .fm-co-brand-accent{color:${accent};}`,
    `${P} .fm-co-secure{justify-self:end;display:inline-flex;align-items:center;gap:8px;color:var(--co-muted);}`,
    `${phone}{${P} .fm-co-header{height:56px;padding:0 4px;grid-template-columns:48px 1fr 48px;gap:0;} ${P} .fm-co-back{justify-content:center;width:48px;min-height:48px;} ${P} .fm-co-back-text,${P} .fm-co-secure-text{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;} ${P} .fm-co-secure{justify-self:center;} ${P} .fm-co-brand{font-size:20px;line-height:24px;}}`,
    // Two columns
    `${P} .fm-co-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:40px;max-width:1200px;margin:0 auto;padding:24px 16px 48px;}`,
    `@media (min-width:${PHONE_MAX + 1}px){${P} .fm-co-grid{padding:48px 40px 96px;max-width:760px;}}`,
    `${wide}{${P} .fm-co-grid{grid-template-columns:minmax(0,680px) minmax(360px,424px);justify-content:center;column-gap:clamp(48px, 6vw, 96px);max-width:none;padding:64px clamp(40px, 8vw, 120px) 96px;align-items:start;}}`,
    `${P} .fm-co-form{display:flex;flex-direction:column;gap:48px;min-width:0;}`,
    `${phone}{${P} .fm-co-form{gap:40px;}}`,
    `${P} .fm-co-title{margin:0;font-family:var(--co-head);font-size:${titleSize}px;line-height:1;text-transform:uppercase;letter-spacing:.01em;font-weight:400;color:${fg};}`,
    `${phone}{${P} .fm-co-title{font-size:${Math.round(titleSize * 0.625)}px;}}`,
    // Sections
    `${P} .fm-co-section{display:flex;flex-direction:column;gap:24px;min-width:0;}`,
    `${phone}{${P} .fm-co-section{gap:16px;}}`,
    `${P} .fm-co-section-head{display:flex;align-items:baseline;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--co-rule);}`,
    `${phone}{${P} .fm-co-section-head{padding-bottom:12px;}}`,
    `${P} .fm-co-marker{color:${marker};}`,
    `${P} .fm-co-h2{margin:0;font-family:var(--co-head);font-size:${sectionSize}px;line-height:1.33;text-transform:uppercase;letter-spacing:.01em;font-weight:400;color:${fg};}`,
    `${P} .fm-co-tag{margin-left:auto;color:var(--co-muted);text-align:right;}`,
    `${P} .fm-co-note{margin:0;font-size:14px;line-height:20px;color:var(--co-muted);}`,
    `${P} .fm-co-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;}`,
    `${phone}{${P} .fm-co-row-phone-stack{grid-template-columns:minmax(0,1fr);}}`,
    // Fields with their label above
    `${P} .fm-co-field{display:flex;flex-direction:column;gap:8px;min-width:0;position:relative;}`,
    `${P} .fm-co-label{color:var(--co-muted);}`,
    `${P} .fm-co-input:not(#fm-studio){box-sizing:border-box;width:100%;height:${fieldH}px;padding:0 16px;background:${fieldBg} !important;color:${fieldText};border:1px solid ${fieldBorder} !important;border-radius:${radius} !important;font:400 16px/24px var(--body-font, inherit);outline:none;box-shadow:none;transition:border-color .12s, box-shadow .12s;}`,
    `${P} textarea.fm-co-input:not(#fm-studio){height:auto;padding:12px 16px;}`,
    `${P} .fm-co-input::placeholder{color:rgba(var(--fg-rgb), .4);}`,
    `${P} .fm-co-input:not(#fm-studio):focus{border-color:${accent} !important;box-shadow:inset 0 0 0 1px ${accent};outline:none;}`,
    `${P} .fm-co-input:not(#fm-studio)[aria-invalid="true"]{border-color:var(--danger, #e8402a) !important;}`,
    `${P} .fm-co-select{position:relative;}`,
    `${P} .fm-co-select .fm-co-input{appearance:none;-webkit-appearance:none;padding-right:44px;cursor:pointer;}`,
    `${P} .fm-co-chevron{position:absolute;right:16px;top:50%;transform:translateY(-50%);pointer-events:none;color:${fg};}`,
    // Address / country suggestions
    `${P} .fm-address-suggest{border:2px solid ${fg} !important;border-radius:0 !important;background:${fieldBg} !important;box-shadow:none !important;}`,
    `${P} .fm-address-suggest [aria-selected="true"] > button,${P} .fm-address-suggest button[aria-selected="true"]{background:rgba(var(--fg-rgb), .08);}`,
    `${P} .fm-co-box{border:1px solid var(--co-rule);padding:12px 16px;}`,
    // Choices: delivery rates, and payment methods in list style
    `${P} .fm-co-choices{display:flex;flex-direction:column;}`,
    `${P} .fm-co-choice{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:16px;align-items:center;padding:16px;border:1px solid var(--co-rule);cursor:pointer;position:relative;color:${fg};}`,
    `${P} .fm-co-choice + .fm-co-choice{border-top:0;}`,
    `${P} .fm-co-choice:has(input:checked){outline:2px solid ${accent};outline-offset:-1px;z-index:1;background:${fieldBg};}`,
    `${P} .fm-co-choice:has(input:focus-visible){outline:2px solid var(--rp-focus, ${accent});outline-offset:2px;}`,
    `${P} .fm-co-choice input[type=radio]{width:18px;height:18px;margin:0;accent-color:${accent};}`,
    `${P} .fm-co-choice-name{display:block;font-weight:600;font-size:16px;line-height:24px;}`,
    `${P} .fm-co-choice-meta{display:block;font-size:14px;line-height:20px;color:var(--co-muted);}`,
    `${P} .fm-co-choice-price{font-family:var(--co-meta);font-size:14px;line-height:20px;letter-spacing:.04em;white-space:nowrap;}`,
    `${P} .fm-co-empty{padding:16px;border:1px solid var(--co-rule);font-size:14px;line-height:20px;color:var(--co-muted);}`,
    // Segmented buttons (shipping / local delivery, and payment tabs)
    `${P} .fm-co-seg{display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));}`,
    `${P} .fm-co-seg-btn{height:48px;padding:0 16px;background:transparent;color:${fg};border:2px solid rgba(var(--fg-rgb), .32);cursor:pointer;}`,
    `${P} .fm-co-seg-btn + .fm-co-seg-btn{border-left:0;}`,
    `${P} .fm-co-seg-btn[aria-pressed="true"]{background:${fg};color:var(--bg-color, Canvas);border-color:${fg};}`,
    // Payment choices
    `${P} .fm-co-pay[data-pay-tabs="tabs"]{display:flex;flex-wrap:wrap;}`,
    `${P} .fm-co-pay[data-pay-tabs="tabs"] .fm-co-pay-tab{order:0;flex:1 1 0;min-width:120px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 16px;margin:0;border:2px solid rgba(var(--fg-rgb), .32);background:transparent;color:${fg};cursor:pointer;text-align:center;}`,
    `${P} .fm-co-pay[data-pay-tabs="tabs"] .fm-co-pay-tab + .fm-co-pay-tab{border-left:0;}`,
    `${P} .fm-co-pay[data-pay-tabs="tabs"] .fm-co-pay-tab:has(input:checked){background:${fg};color:var(--bg-color, Canvas);border-color:${fg};}`,
    `${P} .fm-co-pay[data-pay-tabs="tabs"] .fm-co-pay-tab:has(input:focus-visible){outline:2px solid var(--rp-focus, ${accent});outline-offset:2px;}`,
    `${P} .fm-co-pay[data-pay-tabs="tabs"] .fm-co-pay-tab input{position:absolute;opacity:0;width:1px;height:1px;}`,
    `${P} .fm-co-pay-tab label{cursor:pointer;min-height:44px;display:flex;align-items:center;gap:12px;margin:0;}`,
    `${P} .fm-co-pay[data-pay-tabs="tabs"] .fm-co-pay-tab label{flex:1;align-self:stretch;justify-content:center;}`,
    `${P} .fm-co-pay-tab .fm-co-brands{margin:0 0 0 auto;}`,
    `${P} .fm-co-pay[data-pay-tabs="tabs"] .fm-co-pay-body{order:1;flex:0 0 100%;min-width:0;padding:24px 0 0;border:0;}`,
    `${P} .fm-co-pay[data-pay-tabs="list"] .fm-co-pay-tab{display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:16px;border:1px solid var(--co-rule);background:transparent;color:${fg};cursor:pointer;}`,
    `${P} .fm-co-pay[data-pay-tabs="list"] .fm-co-pay-tab:has(input:checked){outline:2px solid ${accent};outline-offset:-1px;position:relative;z-index:1;}`,
    `${P} .fm-co-pay[data-pay-tabs="list"] > * + .fm-co-pay-tab{border-top:0;}`,
    `${P} .fm-co-pay[data-pay-tabs="list"] .fm-co-pay-tab input{width:18px;height:18px;margin:0;accent-color:${accent};}`,
    `${P} .fm-co-pay[data-pay-tabs="list"] .fm-co-pay-body{padding:16px;border:1px solid var(--co-rule);border-top:0;}`,
    `${P} .fm-co-brands{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;}`,
    `${P} .fm-co-brands span{font-family:var(--co-meta);font-size:12px;line-height:16px;letter-spacing:.08em;padding:4px 8px;border:1px solid var(--co-rule);color:var(--co-muted);}`,
    // Pay button
    `${P} .fm-co-paybtn{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;height:${payH}px;padding:0 24px;border:0;border-radius:0;background:${payBg};color:${payText};box-shadow:${payShadow};font-family:var(--co-head);font-size:24px;line-height:32px;text-transform:uppercase;letter-spacing:.01em;font-weight:400;cursor:pointer;transition:transform .08s, box-shadow .08s;}`,
    `${P} .fm-co-paybtn:hover:not(:disabled){filter:brightness(1.06);}`,
    `${P} .fm-co-paybtn:active:not(:disabled){transform:translate(2px, 2px);box-shadow:none;}`,
    `${P} .fm-co-paybtn:disabled{opacity:.5;cursor:not-allowed;}`,
    `${P} .fm-co-paybtn-busy{justify-content:center;}`,
    `${P} .fm-co-fine{margin:0;color:var(--co-muted);text-align:center;}`,
    `${P} .fm-co-fine a{color:${fg};text-decoration:underline;text-underline-offset:3px;}`,
    // The slip
    `${P} .fm-co-slip{border:${slipW}px solid ${slipEdge};box-shadow:${shadow(slipShadowX, slipShadowColor)};background:${slipBg};color:${fg};display:flex;flex-direction:column;}`,
    `${wide}{${P} .fm-co-aside{align-self:stretch;} ${P} .fm-co-slip{position:sticky;top:32px;}}`,
    `${P} .fm-co-slip-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:24px;border-bottom:${slipW}px solid ${slipEdge};}`,
    `${P} .fm-co-slip-title{margin:0;font-family:var(--co-head);font-size:${slipTitle}px;line-height:1;text-transform:uppercase;letter-spacing:.01em;font-weight:400;color:${fg};}`,
    `${P} .fm-co-slip-meta{text-align:right;color:var(--co-muted);}`,
    `${P} .fm-co-lines{padding:0 24px;}`,
    `${P} .fm-co-line{display:grid;grid-template-columns:24px ${thumbW}px minmax(0,1fr) auto;gap:16px;padding:24px 0;border-bottom:1px solid var(--co-rule);align-items:start;}`,
    `${P} .fm-co-lines[data-numbers="off"] .fm-co-line{grid-template-columns:${thumbW}px minmax(0,1fr) auto;}`,
    `${P} .fm-co-line-num{color:${marker};}`,
    `${P} .fm-co-thumb{width:${thumbW}px;aspect-ratio:3 / 4;object-fit:cover;display:block;background:rgba(var(--fg-rgb), .08);}`,
    `${P} .fm-co-line-title{margin:0;font-weight:600;font-size:16px;line-height:24px;overflow-wrap:anywhere;}`,
    `${P} .fm-co-line-meta{margin:4px 0 0;font-size:14px;line-height:20px;color:var(--co-muted);}`,
    `${P} .fm-co-line-qty{margin-top:8px;color:var(--co-muted);}`,
    `${P} .fm-co-line-price{font-family:var(--co-meta);font-size:14px;line-height:24px;letter-spacing:.04em;white-space:nowrap;}`,
    `${P} .fm-co-codes{display:flex;flex-direction:column;gap:0;padding:24px;border-bottom:1px ${perforated ? "dashed" : "solid"} ${perforated ? "rgba(var(--fg-rgb), .5)" : "var(--co-rule)"};}`,
    `${P} .fm-co-pay-codes{padding:0;border:0;}`,
    // Folded links sit close (each is already a 44px tap row); an open box gets breathing room.
    `${P} .fm-co-codes > * + :is(:has(.fm-co-code-row), .fm-co-box){margin-top:8px;}`,
    `${P} .fm-co-codes > :has(.fm-co-code-row) + *{margin-top:8px;}`,
    `${P} .fm-co-code-row{display:flex;gap:8px;}`,
    `${P} .fm-co-code-row .fm-co-input{flex:1;min-width:0;}`,
    `${P} .fm-co-btn-outline{height:${fieldH}px;padding:0 16px;background:transparent;color:${fg};border:2px solid ${fg};border-radius:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}`,
    `${P} .fm-co-btn-outline:disabled{opacity:.5;cursor:not-allowed;}`,
    `${P} .fm-co-link{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:0;min-height:44px;color:${fg};cursor:pointer;text-decoration:underline;text-underline-offset:4px;}`,
    `${P} .fm-co-ledger{margin:0;padding:24px;display:grid;grid-template-columns:minmax(0,1fr) auto;row-gap:12px;column-gap:16px;font-size:14px;line-height:20px;}`,
    `${P} .fm-co-ledger dt{color:var(--co-muted);}`,
    `${P} .fm-co-ledger dd{margin:0;font-family:var(--co-meta);letter-spacing:.04em;text-align:right;white-space:nowrap;}`,
    `${P} .fm-co-ledger .fm-co-wide{grid-column:1 / -1;}`,
    `${P} .fm-co-total{margin:0 24px;padding:24px 0;border-top:2px solid ${fg};display:flex;justify-content:space-between;align-items:baseline;gap:16px;}`,
    `${P} .fm-co-total-label{font-family:var(--co-head);font-size:24px;line-height:32px;text-transform:uppercase;letter-spacing:.01em;}`,
    `${P} .fm-co-total-amount{margin:0;font-family:var(--co-head);font-size:${totalSize}px;line-height:1;text-transform:uppercase;letter-spacing:.01em;}`,
    `${P} .fm-co-slip-foot{padding:16px 24px;background:${footBg};color:${footText};}`,
    `${P} .fm-co-slip-extra{padding:0 24px 24px;display:flex;flex-direction:column;gap:16px;}`,
    // Phone / tablet: the slip folds into a bar at the top of the page
    `${P} .fm-co-slipbar{display:none;}`,
    `${narrow}{${P} .fm-co-aside{order:-1;} ${P} .fm-co-slipbar{display:flex;align-items:center;gap:16px;width:100%;padding:16px;background:${slipBg};color:${fg};border:${slipW}px solid ${slipEdge};box-shadow:${shadow(Math.min(slipShadowX, 4), slipShadowColor)};cursor:pointer;text-align:left;} ${P} .fm-co-aside[data-open="false"] .fm-co-slip{display:none;} ${P} .fm-co-aside[data-open="true"] .fm-co-slip{margin-top:24px;} ${P} .fm-co-slip-codes-desktop{display:none;}}`,
    `${wide}{${P} .fm-co-pay-codes{display:none;}}`,
    `${P} .fm-co-covers{display:flex;flex-shrink:0;}`,
    `${P} .fm-co-covers img{width:32px;height:44px;object-fit:cover;display:block;background:rgba(var(--fg-rgb), .08);}`,
    `${P} .fm-co-covers img + img{margin-left:-12px;border:2px solid ${slipBg};}`,
    `${P} .fm-co-slipbar-text{flex:1;min-width:0;display:flex;flex-direction:column;}`,
    `${P} .fm-co-slipbar-title,${P} .fm-co-slipbar-total{font-family:var(--co-head);font-size:20px;line-height:24px;text-transform:uppercase;letter-spacing:.01em;}`,
    // Phone Pay bar
    `${P} .fm-co-paybar{display:none;}`,
    `${phone}{${P}[data-paybar="on"] .fm-co-paybtn-main{display:none;} ${P}[data-paybar="on"]{padding-bottom:160px;} ${P}[data-paybar="on"] .fm-co-paybar{display:flex;flex-direction:column;gap:8px;position:fixed;left:0;right:0;bottom:0;z-index:40;padding:16px 16px calc(16px + env(safe-area-inset-bottom, 0px));background:var(--bg-color, Canvas);border-top:2px solid ${fg};} ${P} .fm-co-paybar .fm-co-paybtn{height:56px;justify-content:center;}}`,
    `${P} .fm-co-paybar-row{display:flex;justify-content:space-between;gap:16px;color:var(--co-muted);}`,
    `${P} .fm-co-paybar-row span:last-child{color:${fg};}`,
  ].join("\n");
}
