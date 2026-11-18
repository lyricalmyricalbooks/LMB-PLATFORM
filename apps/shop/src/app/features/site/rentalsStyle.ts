// Rentals page (RentalsPage.tsx): the parts the order slip (trackingStyle.ts) doesn't have, in the same print language.
// Token-driven only: every colour is a theme variable.
//   fm-rnt-items  the item cards in a grid     fm-rnt-item   one item: photo, name, price, Rent this
//   fm-rnt-book   the picker under an item     fm-rnt-chips  start times or days, each a chip (fm-rnt-chip)
//   fm-rnt-sum    what it costs                fm-rnt-done   the booked rental after paying
const S = ".fm-track";

export const RENTALS_CSS = [
  `${S} .fm-rnt-items{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));margin:0;padding:0;list-style:none;}`,
  `${S} .fm-rnt-item{display:flex;flex-direction:column;gap:12px;padding:0;overflow:hidden;}`,
  `${S} .fm-rnt-item[data-open]{box-shadow:inset 0 0 0 2px var(--accent, currentColor);}`,
  `${S} .fm-rnt-photo{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;}`,
  `${S} .fm-rnt-body{display:flex;flex-direction:column;gap:10px;padding:20px 22px 22px;flex:1;}`,
  `${S} .fm-rnt-item h2{margin:0;font-size:22px;line-height:1.25;font-weight:700;overflow-wrap:anywhere;}`,
  `${S} .fm-rnt-price{margin:0;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;}
${S} .fm-rnt-tax{display:block;font-weight:400;opacity:.75;font-size:.85em;margin-top:2px;}`,
  `${S} .fm-rnt-desc{margin:0;font-size:15px;line-height:1.55;white-space:pre-line;color:var(--muted, currentColor);}`,
  `${S} .fm-rnt-item .fm-track-btn{margin-top:auto;width:100%;}`,
  `${S} .fm-rnt-book{margin-top:28px;padding:24px;display:grid;gap:18px;max-width:52rem;scroll-margin-top:24px;}`,
  `${S} .fm-rnt-book h2{margin:0;font-size:22px;line-height:1.25;font-weight:700;overflow-wrap:anywhere;}`,
  `${S} .fm-rnt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;}`,
  `${S} .fm-rnt-field{display:grid;gap:6px;min-width:0;align-content:start;}`,
  `${S} .fm-rnt-field label,${S} .fm-rnt-legend{font-size:13px;font-weight:600;color:var(--muted, currentColor);}`,
  `${S} .fm-rnt-chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,92px),1fr));gap:8px;margin:0;padding:0;list-style:none;}`,
  `${S} .fm-rnt-chip{width:100%;min-height:44px;padding:8px 10px;border:var(--t-edge-w, 1px) solid var(--t-edge, currentColor);border-radius:var(--rp-card-radius, 0px);background:transparent;color:inherit;font:inherit;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer;}`,
  `${S} .fm-rnt-chip[aria-pressed="true"]{background:var(--accent, currentColor);color:var(--on-accent, inherit);border-color:var(--accent, currentColor);}`,
  `${S} .fm-rnt-chip:disabled{opacity:.4;cursor:not-allowed;text-decoration:line-through;}`,
  `${S} .fm-rnt-chip:focus-visible{outline:2px solid var(--accent, currentColor);outline-offset:2px;}`,
  `${S} .fm-rnt-sum{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 16px;padding-top:14px;border-top:1px solid color-mix(in srgb, currentColor 14%, transparent);}`,
  `${S} .fm-rnt-sum strong{font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums;}`,
  `${S} .fm-rnt-hint{margin:0;font-size:13px;line-height:1.5;color:var(--muted, currentColor);}`,
  `${S} .fm-rnt-error{margin:0;font-size:14px;color:var(--danger, currentColor);}`,
  `${S} .fm-rnt-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px;}`,
  `${S} .fm-rnt-foot .fm-track-btn{width:auto;}`,
  `${S} .fm-rnt-done{margin-bottom:28px;padding:24px;display:grid;gap:10px;max-width:44rem;}`,
  `${S} .fm-rnt-done h2{margin:0;font-size:24px;line-height:1.25;font-weight:700;}`,
  `@media (max-width:560px){${S} .fm-rnt-book{padding:18px;}${S} .fm-rnt-grid{grid-template-columns:minmax(0,1fr);}${S} .fm-rnt-foot .fm-track-btn{width:100%;}}`,
].join("\n");
