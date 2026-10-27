// "Added to your bag" notice (Studio › Style › Cart drawer (shopping bag) › After adding a book).
// Like Shopify's "cart type: notification": adding a book shows a small card in the corner instead of
// opening the whole bag. Off by default (the bag opens, as before). Pure rules shared by the notice,
// the bag drawer and their tests.

export const addedNoticeOn = (design: any): boolean => design?.cartAddAction === "notice";

/** Seconds the notice stays before closing itself; 0 = until the shopper closes it. Default 6. */
export function addedNoticeSeconds(design: any): number {
  const raw = Number(design?.cartAddNoticeSeconds);
  if (design?.cartAddNoticeSeconds === undefined || design?.cartAddNoticeSeconds === "" || !Number.isFinite(raw)) return 6;
  return Math.min(30, Math.max(0, Math.round(raw)));
}

/** Pages where the notice never shows: checkout has its own order summary. */
export const noticeAllowedOn = (pathname: string): boolean => !/(^|\/)checkout(\/|$)/.test(pathname || "");

// Token-only CSS layered on the bag's own look (.fm-bag from cartDrawerStyle.ts), so the notice
// follows every Cart drawer colour, font and button control. Sits in the bag's corner (side follows
// "Slides in from"), full width on phones, never animates under reduced motion.
export const ADDED_NOTICE_CSS = `
.fm-bag.fm-bag-notice{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));z-index:65;width:min(380px,calc(100vw - 24px));
border:var(--bag-edge-w,2px) solid var(--bag-edge,currentColor);box-shadow:var(--rp-shadow-x,4px) var(--rp-shadow-x,4px) 0 var(--bag-edge,currentColor);
padding:16px var(--bag-pad,20px);animation:fm-bag-notice-in .22s ease-out}
.fm-bag.fm-bag-notice[data-side="right"]{right:12px}.fm-bag.fm-bag-notice[data-side="left"]{left:12px}
.fm-bag-notice-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}
.fm-bag-notice-row{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.fm-bag-notice .fm-bag-thumb{width:56px}
.fm-bag-notice-actions{display:grid;gap:8px}
.fm-bag-notice .fm-bag-cta{min-height:44px;width:100%;display:flex;align-items:center;justify-content:center;cursor:pointer}
.fm-bag-notice-link{background:transparent;color:inherit;border:0;font:inherit;text-decoration:underline;text-underline-offset:3px;min-height:44px;cursor:pointer}
.fm-bag-notice .fm-bag-close{min-width:36px;min-height:36px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
@keyframes fm-bag-notice-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (max-width:767px){.fm-bag.fm-bag-notice[data-side]{left:12px;right:12px;width:auto}}
@media (prefers-reduced-motion:reduce){.fm-bag.fm-bag-notice{animation:none}}
`;
