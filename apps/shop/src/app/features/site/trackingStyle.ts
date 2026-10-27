// Order tracking (features/site/OrderTracking.tsx) as a Riso "order slip", the same
// print language as the shopping bag (cartDrawerStyle.ts): square corners, ink
// outlines with a flat accent offset shadow, ruled ledgers, a rubber-stamp status,
// big condensed headings and small mono labels. Token-driven only — every colour is
// a theme variable, so the page follows Studio's palette and the Riso Noir default.
//   fm-track            page root                 fm-track-mono   small mono labels
//   fm-track-display    big condensed heading     fm-track-card   outlined slip card
//   fm-track-rule       hairline divider          fm-track-stamp  payment stamp (data-state)
//   fm-track-notice     dashed status banner (data-tone)
//   fm-track-btn        accent button (+ -ghost)  fm-track-input  outlined field
//   fm-track-step / -dot  numbered progress steps (data-done / data-current)
//   fm-track-ledger / -row / -total            items + totals ledger
const S = ".fm-track";

export const TRACKING_CSS = [
  `${S}{--t-rule:rgba(var(--fg-rgb),0.18);--t-edge:var(--rp-outline, rgb(var(--fg-rgb)));--t-edge-w:var(--rp-outline-w, 2px);--t-shadow:var(--accent);--t-mono:'DM Mono', ui-monospace, monospace;}`,
  `${S} .fm-track-mono{font-family:var(--t-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted, currentColor);}`,
  `${S} .fm-track-display{font-family:var(--heading-font, inherit);text-transform:var(--rp-heading-transform, uppercase);line-height:.9;letter-spacing:.01em;margin:0;}`,
  `${S} .fm-track-card{border:var(--t-edge-w) solid var(--t-edge);background:var(--surface, transparent);box-shadow:6px 6px 0 var(--t-shadow);border-radius:var(--rp-card-radius, 0px);}`,
  `${S} .fm-track-strip{height:8px;background:repeating-linear-gradient(90deg,var(--accent) 0 48px,transparent 48px 56px);}`,
  `${S} .fm-track-rule{border-color:var(--t-rule);}`,
  `${S} .fm-track-stamp{display:inline-flex;align-items:center;gap:6px;border:2px solid currentColor;padding:5px 10px;font-family:var(--t-mono);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;transform:rotate(-3deg);}`,
  `${S} .fm-track-stamp[data-state="paid"]{color:var(--success, currentColor);}`,
  `${S} .fm-track-stamp[data-state="unpaid"]{color:var(--warning, currentColor);}`,
  `${S} .fm-track-stamp[data-state="ended"]{color:var(--danger, currentColor);}`,
  `${S} .fm-track-notice{border:2px dashed currentColor;padding:18px 20px;display:flex;flex-wrap:wrap;gap:14px 20px;align-items:center;justify-content:space-between;}`,
  `${S} .fm-track-notice[data-tone="warning"]{color:var(--warning, currentColor);background:rgba(var(--warning-rgb, 0, 0, 0), 0.06);}`,
  `${S} .fm-track-notice[data-tone="danger"]{color:var(--danger, currentColor);background:rgba(var(--danger-rgb, 0, 0, 0), 0.06);}`,
  `${S} .fm-track-notice p{margin:0;font-size:14px;line-height:1.5;}`,
  `${S} .fm-track-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 22px;border:var(--t-edge-w) solid var(--t-edge);background:var(--accent);color:var(--on-accent, rgb(var(--fg-rgb)));font-family:var(--t-mono);font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;border-radius:var(--rp-card-radius, 0px);cursor:pointer;transition:transform .12s ease, box-shadow .12s ease;}`,
  `${S} .fm-track-btn:hover:not(:disabled){transform:translate(-2px,-2px);box-shadow:4px 4px 0 rgb(var(--fg-rgb));}`,
  `${S} .fm-track-btn:focus-visible,${S} .fm-track-input:focus-visible,${S} .fm-track-link:focus-visible{outline:2px solid var(--rp-focus, var(--accent));outline-offset:3px;}`,
  `${S} .fm-track-btn:disabled{opacity:.6;cursor:progress;}`,
  `${S} .fm-track-btn-ghost{background:transparent;color:inherit;}`,
  `${S} .fm-track-link{display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;}`,
  `${S} .fm-track-link:hover{text-decoration:underline;text-underline-offset:4px;}`,
  `${S} .fm-track-input{width:100%;min-height:52px;padding:0 16px;border:var(--t-edge-w) solid var(--t-edge);background:transparent;color:inherit;border-radius:var(--rp-card-radius, 0px);font-size:15px;}`,
  `${S} .fm-track-input::placeholder{color:var(--muted, currentColor);opacity:.7;}`,
  `${S} .fm-track-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;}`,
  `@media (max-width:640px){${S} .fm-track-steps{grid-template-columns:1fr;}}`,
  `${S} .fm-track-step{position:relative;padding:18px 16px 18px 0;border-top:2px solid var(--t-rule);}`,
  `${S} .fm-track-step[data-done="true"]{border-top-color:var(--accent);}`,
  `${S} .fm-track-dot{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:2px solid var(--t-edge);font-family:var(--t-mono);font-size:13px;font-weight:700;margin-bottom:12px;}`,
  `${S} .fm-track-step[data-done="true"] .fm-track-dot{background:var(--accent);color:var(--on-accent, rgb(var(--fg-rgb)));}`,
  `${S} .fm-track-step[data-current="true"] .fm-track-dot{box-shadow:4px 4px 0 rgb(var(--fg-rgb));}`,
  `${S} .fm-track-step[data-done="false"]{opacity:.55;}`,
  `${S} .fm-track-ledger .fm-track-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px dashed var(--t-rule);}`,
  `${S} .fm-track-ledger .fm-track-total{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding-top:16px;margin-top:8px;border-top:4px double var(--t-edge);}`,
  // Phones: small labels never under 12px, links get a full-height tap area.
  `@media (max-width:767px){${S} .fm-track-mono,${S} .fm-track-stamp{font-size:12px;}${S} .fm-track-link{min-height:44px;}}`,
  `${S} .fm-track-thumb{width:64px;aspect-ratio:3/4;flex-shrink:0;border:2px solid var(--t-edge);overflow:hidden;background:var(--surface, transparent);}`,
].join("\n");
