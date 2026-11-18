// Membership page (MembershipPage.tsx) and the account's membership card (AccountMembership.tsx): the parts the order slip
// (trackingStyle.ts) doesn't have, in the same print language. Token-driven only: every colour is a theme variable.
//   fm-mbr-plans   the plan cards in a grid          fm-mbr-plan    one plan: name, price, trial, perks, Join
//   fm-mbr-price   big price with its interval       fm-mbr-perks   what members get, one per line
//   fm-mbr-facts   the account card's rows           fm-mbr-actions the account card's buttons
//   fm-mbr-member-price  a plan's member price line, marked with the shop's accent
//   fm-mbr-ship    a box membership's address        fm-mbr-address the address form (fm-mbr-field each, fm-mbr-wide full row)
//   fm-mbr-plan-actions  Join and Give as a gift      fm-mbr-gift    the gift form (M5): lengths, their details, Pay
//   fm-mbr-gift-thanks   the thank-you after paying for a gift
const S = ".fm-track";

export const MEMBERSHIP_CSS = [
  `${S} .fm-mbr-plans{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));margin:0;padding:0;list-style:none;}`,
  `${S} .fm-mbr-plan{display:flex;flex-direction:column;gap:14px;padding:24px;}`,
  `${S} .fm-mbr-plan h2{margin:0;font-size:22px;line-height:1.25;font-weight:700;overflow-wrap:anywhere;}`,
  `${S} .fm-mbr-price{margin:0;display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;}`,
  `${S} .fm-mbr-price strong{font-size:34px;line-height:1.05;font-weight:700;font-variant-numeric:tabular-nums;}`,
  `${S} .fm-mbr-desc{margin:0;font-size:15px;line-height:1.55;white-space:pre-line;color:var(--muted, currentColor);}`,
  `${S} .fm-mbr-member-price{margin:0;padding:2px 0 2px 12px;border-left:3px solid var(--accent, currentColor);font-size:15px;line-height:1.45;font-weight:600;}`,
  `${S} .fm-mbr-perks{margin:0;padding:0 0 0 20px;display:grid;gap:6px;font-size:15px;line-height:1.45;list-style:disc;}`,
  `${S} .fm-mbr-plan-actions{margin-top:auto;display:grid;gap:10px;}`,
  `${S} .fm-mbr-plan .fm-track-btn{width:100%;}`,
  `${S} .fm-mbr-gift{margin-top:28px;padding:24px;display:grid;gap:18px;max-width:44rem;scroll-margin-top:24px;}`,
  `${S} .fm-mbr-gift h2{margin:0;font-size:22px;line-height:1.25;font-weight:700;overflow-wrap:anywhere;}`,
  `${S} .fm-mbr-gift fieldset{margin:0;padding:0;border:0;display:grid;gap:10px;min-width:0;}`,
  `${S} .fm-mbr-gift legend{margin-bottom:8px;padding:0;font-size:13px;font-weight:600;color:var(--muted, currentColor);}`,
  `${S} .fm-mbr-lengths{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:10px;}`,
  `${S} .fm-mbr-length{display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 14px;border:var(--t-edge-w, 1px) solid var(--t-edge, currentColor);border-radius:var(--rp-card-radius, 0px);cursor:pointer;font-weight:600;font-variant-numeric:tabular-nums;}`,
  `${S} .fm-mbr-length:has(input:checked){box-shadow:inset 0 0 0 2px var(--accent, currentColor);}`,
  `${S} .fm-mbr-length:has(input:focus-visible){outline:2px solid var(--accent, currentColor);outline-offset:3px;}`,
  `${S} .fm-mbr-length input{width:18px;height:18px;flex:none;accent-color:var(--accent);}`,
  `${S} .fm-mbr-gift-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;}`,
  `${S} .fm-mbr-gift textarea{min-height:88px;resize:vertical;line-height:1.5;padding:12px 14px;}`,
  `${S} .fm-mbr-hint{margin:0;font-size:13px;line-height:1.5;color:var(--muted, currentColor);}`,
  `${S} .fm-mbr-gift-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px;}`,
  `${S} .fm-mbr-gift-foot .fm-track-btn{width:auto;}`,
  `${S} .fm-mbr-gift-thanks{margin-bottom:28px;}`,
  `@media (max-width:560px){${S} .fm-mbr-gift{padding:18px;}${S} .fm-mbr-gift-grid{grid-template-columns:minmax(0,1fr);}${S} .fm-mbr-gift-foot .fm-track-btn{width:100%;}}`,
  `${S} .fm-mbr-error{margin:0;font-size:14px;color:var(--danger, currentColor);}`,
  `${S} .fm-mbr-note{margin:24px 0 0;font-size:14px;line-height:1.55;color:var(--muted, currentColor);max-width:70ch;}`,
  `.fm-mbr-facts{display:grid;gap:10px;margin:0;}`,
  `.fm-mbr-facts div{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 16px;}`,
  `.fm-mbr-facts dt{color:var(--muted, currentColor);font-size:14px;}`,
  `.fm-mbr-facts dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;}`,
  `.fm-mbr-actions{display:flex;flex-wrap:wrap;gap:12px;}`,
  `.fm-mbr-ship{display:grid;gap:12px;padding-top:16px;border-top:1px solid color-mix(in srgb, currentColor 14%, transparent);}`,
  `.fm-mbr-ship dd{text-align:right;line-height:1.5;overflow-wrap:anywhere;}`,
  `.fm-mbr-address{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;padding-top:16px;border-top:1px solid color-mix(in srgb, currentColor 14%, transparent);}`,
  `.fm-mbr-wide{grid-column:1/-1;}`,
  `.fm-mbr-field{display:grid;gap:6px;min-width:0;align-content:start;}`,
  `.fm-mbr-field label{font-size:13px;font-weight:600;color:var(--muted, currentColor);}`,
  `.fm-mbr-field input,.fm-mbr-field select,.fm-mbr-field textarea{width:100%;min-height:44px;padding:10px 14px;border-radius:12px;border:1px solid color-mix(in srgb, currentColor 22%, transparent);background:transparent;color:inherit;font:inherit;font-size:15px;}`,
  `.fm-mbr-field select option{background:Canvas;color:CanvasText;}`,
  `.fm-mbr-field input:focus-visible,.fm-mbr-field select:focus-visible,.fm-mbr-field textarea:focus-visible{outline:2px solid var(--accent, currentColor);outline-offset:1px;}`,
  `.fm-mbr-posts{display:grid;gap:14px;padding-top:20px;border-top:1px solid color-mix(in srgb, currentColor 14%, transparent);}`,
  `.fm-mbr-posts h3{margin:0;font-size:18px;font-weight:700;line-height:1.3;}`,
  `.fm-mbr-posts ul{margin:0;padding:0;list-style:none;display:grid;gap:18px;}`,
  `.fm-mbr-post{display:grid;gap:6px;min-width:0;}`,
  `.fm-mbr-post + .fm-mbr-post{padding-top:18px;border-top:1px dashed color-mix(in srgb, currentColor 18%, transparent);}`,
  `.fm-mbr-post h4{margin:0;font-size:16px;font-weight:700;line-height:1.35;overflow-wrap:anywhere;}`,
  `.fm-mbr-post-body{display:grid;gap:10px;font-size:15px;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere;max-width:68ch;}`,
  `.fm-mbr-post-body p{margin:0;}`,
  `@media (max-width:560px){.fm-mbr-address{grid-template-columns:minmax(0,1fr);}}`,
].join("\n");
