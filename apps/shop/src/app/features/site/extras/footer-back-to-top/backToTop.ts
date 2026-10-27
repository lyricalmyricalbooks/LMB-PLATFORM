// Back to top button (Studio › Style › Footer & social links › showBackToTop, off by default).
// Pure rules shared by the button and its tests.

/** The button appears once the shopper has scrolled this many screens down. */
export const BACK_TO_TOP_AFTER_SCREENS = 1.5;

export const backToTopOn = (design: any): boolean => design?.showBackToTop === true;

/** "left" or "right" (default). */
export const backToTopSide = (design: any): "left" | "right" =>
  design?.backToTopPosition === "left" ? "left" : "right";

export const backToTopShown = (scrollY: number, viewportHeight: number): boolean =>
  viewportHeight > 0 && scrollY > viewportHeight * BACK_TO_TOP_AFTER_SCREENS;

// Token-only CSS: square Riso button in the page's own colours. It sits above a book page's
// sticky add-to-bag bar when that bar is showing, and never moves under reduced motion.
export const BACK_TO_TOP_CSS = `
.fm-back-to-top{position:fixed;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:39;display:inline-flex;align-items:center;gap:6px;
min-height:44px;min-width:44px;justify-content:center;padding:0 12px;border:2px solid var(--text-color,currentColor);
background:var(--bg-color,Canvas);color:var(--text-color,CanvasText);font:inherit;font-size:11px;letter-spacing:.2em;text-transform:uppercase;
cursor:pointer;opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .2s,transform .2s,visibility 0s linear .2s}
.fm-back-to-top[data-side="right"]{right:20px}.fm-back-to-top[data-side="left"]{left:20px}
.fm-back-to-top[data-shown="true"]{opacity:1;visibility:visible;transform:none;transition:opacity .2s,transform .2s}
.fm-back-to-top:hover{background:var(--text-color,CanvasText);color:var(--bg-color,Canvas)}
.fm-back-to-top:focus-visible{outline:2px solid var(--accent-color,Highlight);outline-offset:2px}
body:has(.fm-pdp-sticky) .fm-back-to-top{bottom:calc(96px + env(safe-area-inset-bottom,0px))}
@media (max-width:767px){.fm-back-to-top .fm-back-to-top-word{display:none}}
@media (prefers-reduced-motion:reduce){.fm-back-to-top{transform:none;transition:none}}
`;
