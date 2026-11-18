// Membership page (MembershipPage.tsx) and the account's membership card (AccountMembership.tsx): the parts the order slip
// (trackingStyle.ts) doesn't have, in the same print language. Token-driven only: every colour is a theme variable.
//   fm-mbr-plans   the plan cards in a grid          fm-mbr-plan    one plan: name, price, trial, perks, Join
//   fm-mbr-price   big price with its interval       fm-mbr-perks   what members get, one per line
//   fm-mbr-facts   the account card's rows           fm-mbr-actions the account card's buttons
const S = ".fm-track";

export const MEMBERSHIP_CSS = [
  `${S} .fm-mbr-plans{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));margin:0;padding:0;list-style:none;}`,
  `${S} .fm-mbr-plan{display:flex;flex-direction:column;gap:14px;padding:24px;}`,
  `${S} .fm-mbr-plan h2{margin:0;font-size:22px;line-height:1.25;font-weight:700;overflow-wrap:anywhere;}`,
  `${S} .fm-mbr-price{margin:0;display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;}`,
  `${S} .fm-mbr-price strong{font-size:34px;line-height:1.05;font-weight:700;font-variant-numeric:tabular-nums;}`,
  `${S} .fm-mbr-desc{margin:0;font-size:15px;line-height:1.55;white-space:pre-line;color:var(--muted, currentColor);}`,
  `${S} .fm-mbr-perks{margin:0;padding:0 0 0 20px;display:grid;gap:6px;font-size:15px;line-height:1.45;list-style:disc;}`,
  `${S} .fm-mbr-plan .fm-track-btn{margin-top:auto;width:100%;}`,
  `${S} .fm-mbr-error{margin:0;font-size:14px;color:var(--danger, currentColor);}`,
  `${S} .fm-mbr-note{margin:24px 0 0;font-size:14px;line-height:1.55;color:var(--muted, currentColor);max-width:70ch;}`,
  `.fm-mbr-facts{display:grid;gap:10px;margin:0;}`,
  `.fm-mbr-facts div{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 16px;}`,
  `.fm-mbr-facts dt{color:var(--muted, currentColor);font-size:14px;}`,
  `.fm-mbr-facts dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;}`,
  `.fm-mbr-actions{display:flex;flex-wrap:wrap;gap:12px;}`,
].join("\n");
