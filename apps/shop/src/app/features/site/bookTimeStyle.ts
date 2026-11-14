// Book a time page (features/site/BookTime.tsx): the parts the order slip (trackingStyle.ts) doesn't have, in the same
// print language. Token-driven only: every colour is a theme variable, so the page follows Studio's palette.
//   fm-book-steps / -step     the three numbered steps (data-state: done | current | next)
//   fm-book-service           a service card (button)          fm-book-price   mono price tag
//   fm-book-days / -day       the week of day pills (aria-pressed, data-empty)
//   fm-book-times / -time     a day's time chips (aria-pressed)  fm-book-group   Morning / Afternoon / Evening
//   fm-book-summary           the chosen service + time slip      fm-book-actions  a row of buttons
const S = ".fm-track";

export const BOOK_TIME_CSS = [
  `${S} .fm-book-steps{display:flex;gap:0;margin:0 0 28px;padding:0;list-style:none;border-top:2px solid var(--t-rule);}`,
  `${S} .fm-book-step{flex:1;display:flex;align-items:center;gap:10px;padding:12px 8px 0 0;font-family:var(--t-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted, currentColor);margin-top:-2px;border-top:2px solid transparent;}`,
  `${S} .fm-book-step b{width:26px;height:26px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:2px solid var(--t-edge);font-weight:700;}`,
  `${S} .fm-book-step[data-state="done"]{border-top-color:var(--accent);color:inherit;}`,
  `${S} .fm-book-step[data-state="done"] b{background:var(--accent);color:var(--on-accent, rgb(var(--fg-rgb)));}`,
  `${S} .fm-book-step[data-state="current"]{border-top-color:rgb(var(--fg-rgb));color:inherit;}`,
  `${S} .fm-book-step[data-state="current"] b{background:rgb(var(--fg-rgb));color:var(--bg-color, var(--surface, transparent));}`,
  `${S} .fm-book-list{display:grid;gap:16px;}`,
  `${S} .fm-book-service{display:grid;grid-template-columns:1fr auto;gap:6px 20px;align-items:start;width:100%;text-align:left;padding:22px 24px;border:var(--t-edge-w) solid var(--t-edge);background:var(--surface, transparent);color:inherit;border-radius:var(--rp-card-radius, 0px);cursor:pointer;transition:transform .12s ease, box-shadow .12s ease;}`,
  `${S} .fm-book-service:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--t-shadow);}`,
  `${S} .fm-book-service h2{margin:0;font-family:var(--heading-font, inherit);font-size:24px;line-height:1.1;}`,
  `${S} .fm-book-service p{margin:0;grid-column:1/-1;font-size:15px;line-height:1.55;color:var(--muted, currentColor);}`,
  `${S} .fm-book-meta{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px 18px;}`,
  `${S} .fm-book-meta > span{display:inline-flex;align-items:center;gap:6px;}`,
  `${S} .fm-book-price{font-family:var(--t-mono);font-size:13px;font-weight:700;letter-spacing:.08em;white-space:nowrap;padding:4px 10px;border:2px solid currentColor;}`,
  `${S} .fm-book-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;}`,
  `${S} .fm-book-arrow{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border:var(--t-edge-w) solid var(--t-edge);background:transparent;color:inherit;border-radius:var(--rp-card-radius, 0px);cursor:pointer;}`,
  `${S} .fm-book-arrow:disabled{opacity:.35;cursor:default;}`,
  `${S} .fm-book-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:24px;}`,
  `${S} .fm-book-day{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;border:var(--t-edge-w) solid var(--t-edge);background:transparent;color:inherit;border-radius:var(--rp-card-radius, 0px);cursor:pointer;font-family:var(--t-mono);}`,
  `${S} .fm-book-day span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;}`,
  `${S} .fm-book-day strong{font-family:var(--heading-font, inherit);font-size:26px;line-height:1;}`,
  `${S} .fm-book-day[data-empty="true"]{opacity:.4;border-style:dashed;}`,
  `${S} .fm-book-day[aria-pressed="true"]{background:var(--accent);color:var(--on-accent, rgb(var(--fg-rgb)));box-shadow:4px 4px 0 rgb(var(--fg-rgb));opacity:1;}`,
  `@media (max-width:640px){${S} .fm-book-days{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px;}${S} .fm-book-day{flex:0 0 64px;scroll-snap-align:start;}}`,
  `${S} .fm-book-group{margin:0 0 10px;}`,
  `${S} .fm-book-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;margin-bottom:22px;}`,
  `${S} .fm-book-time{min-height:48px;border:var(--t-edge-w) solid var(--t-edge);background:transparent;color:inherit;border-radius:var(--rp-card-radius, 0px);font-family:var(--t-mono);font-size:14px;font-weight:700;cursor:pointer;}`,
  `${S} .fm-book-time:hover{background:rgba(var(--fg-rgb),0.06);}`,
  `${S} .fm-book-time[aria-pressed="true"]{background:rgb(var(--fg-rgb));color:var(--bg-color, var(--surface, transparent));}`,
  `${S} .fm-book-day:focus-visible,${S} .fm-book-time:focus-visible,${S} .fm-book-service:focus-visible,${S} .fm-book-arrow:focus-visible{outline:2px solid var(--rp-focus, var(--accent));outline-offset:3px;}`,
  `${S} .fm-book-summary{display:grid;gap:0;}`,
  `${S} .fm-book-actions{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;}`,
  `${S} .fm-book-actions .fm-track-link{text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px;}`,
  `${S} .fm-book-empty{padding:28px 0;text-align:center;}`,
  `${S} textarea.fm-track-input{min-height:110px;padding:14px 16px;resize:vertical;}`,
  `${S} .fm-book-error{margin:6px 0 0;font-size:13px;color:var(--danger, currentColor);}`,
  `@media (prefers-reduced-motion:reduce){${S} .fm-book-service{transition:none;}${S} .fm-book-service:hover{transform:none;}}`,
].join("\n");
