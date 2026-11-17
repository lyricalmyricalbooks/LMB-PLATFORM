// Timetable page (features/site/ClassesPage.tsx): the parts the order slip (trackingStyle.ts) doesn't have, in the same
// print language. Token-driven only: every colour is a theme variable, so the page follows Studio's palette.
//   fm-cls-week            the week bar: earlier, the dates, later     fm-cls-days / -day   the days with classes
//   fm-cls-day-head        a day's heading (with a Today tag)          fm-cls-list          a day's classes
//   fm-cls-session         one class: time, what it is, places, button fm-cls-tag           mono places tag
const S = ".fm-track";

export const CLASSES_CSS = [
  `${S} .fm-cls-week{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 28px;padding:12px 0;border-top:var(--t-edge-w) solid var(--t-edge);border-bottom:var(--t-edge-w) solid var(--t-edge);}`,
  `${S} .fm-cls-week h2{margin:0;font-family:var(--t-mono);font-size:14px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-align:center;}`,
  `${S} .fm-cls-arrow{width:44px;height:44px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:var(--t-edge-w) solid var(--t-edge);border-radius:var(--rp-card-radius, 0px);background:transparent;color:inherit;text-decoration:none;}`,
  `${S} a.fm-cls-arrow:hover{background:rgba(var(--fg-rgb),0.08);}`,
  `${S} a.fm-cls-arrow:focus-visible{outline:2px solid var(--rp-focus, var(--accent));outline-offset:3px;}`,
  `${S} span.fm-cls-arrow{opacity:.3;}`,
  `${S} .fm-cls-days{display:grid;gap:34px;transition:opacity .15s ease;}`,
  `${S} .fm-cls-days[aria-busy="true"]{opacity:.5;}`,
  `${S} .fm-cls-day-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin:0 0 12px;font-family:var(--heading-font, inherit);font-size:24px;line-height:1.15;}`,
  `${S} .fm-cls-today{font-family:var(--t-mono);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:3px 8px;background:var(--accent);color:var(--on-accent, rgb(var(--fg-rgb)));}`,
  `${S} .fm-cls-list{display:grid;gap:12px;margin:0;padding:0;list-style:none;}`,
  `${S} .fm-cls-session{display:grid;grid-template-columns:104px minmax(0,1fr) auto;gap:8px 22px;align-items:center;padding:18px 22px;border:var(--t-edge-w) solid var(--t-edge);border-radius:var(--rp-card-radius, 0px);background:var(--surface, transparent);}`,
  `${S} .fm-cls-time{display:grid;gap:2px;font-family:var(--t-mono);}`,
  `${S} .fm-cls-time strong{font-size:20px;font-weight:700;letter-spacing:.02em;white-space:nowrap;}`,
  `${S} .fm-cls-time span{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted, currentColor);}`,
  `${S} .fm-cls-main{display:grid;gap:4px;min-width:0;}`,
  `${S} .fm-cls-main h4{margin:0;font-size:19px;font-weight:700;line-height:1.25;overflow-wrap:anywhere;}`,
  `${S} .fm-cls-main p{margin:0;font-size:15px;line-height:1.5;color:var(--muted, currentColor);overflow-wrap:anywhere;}`,
  `${S} .fm-cls-side{display:grid;gap:10px;justify-items:end;}`,
  `${S} .fm-cls-tag{font-family:var(--t-mono);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;}`,
  `${S} .fm-cls-tag[data-state="last"],${S} .fm-cls-tag[data-state="few"]{color:var(--warning, currentColor);}`,
  `${S} .fm-cls-tag[data-state="full"]{opacity:.65;}`,
  `${S} .fm-cls-side .fm-track-btn{width:auto;white-space:nowrap;}`,
  `${S} .fm-cls-session[data-state="full"] .fm-cls-time strong{opacity:.6;}`,
  `${S} .fm-cls-zone{margin:28px 0 0;}`,
  `${S} .fm-cls-empty{padding:28px 0;text-align:center;}`,
  // Courses: a block above the week; each lists its dates under its name.
  `${S} .fm-cls-courses{margin:0 0 44px;}`,
  `${S} .fm-cls-main h3{margin:0;font-size:19px;font-weight:700;line-height:1.25;overflow-wrap:anywhere;}`,
  `${S} .fm-cls-dates{margin:10px 0 0;padding-left:1.3em;display:grid;gap:3px;font-size:14px;line-height:1.5;opacity:.85;}`,
  `@media (max-width:640px){${S} .fm-cls-session{grid-template-columns:minmax(0,1fr);padding:16px;}${S} .fm-cls-time{display:flex;align-items:baseline;gap:10px;}${S} .fm-cls-side{justify-items:stretch;}${S} .fm-cls-side .fm-track-btn{width:100%;}${S} .fm-cls-day-head{font-size:21px;}}`,
  `@media (prefers-reduced-motion:reduce){${S} .fm-cls-days{transition:none;}}`,
].join("\n");
