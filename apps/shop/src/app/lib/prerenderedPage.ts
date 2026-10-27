// Public pages arrive as finished HTML (scripts/prerender-storefront.mjs). Until the app has the code and the
// shop data for that page, it keeps showing that HTML instead of the loading screen, then takes over with the
// same content: no blank, no splash, no second fade-in. Only for the page the visitor landed on; any
// navigation ends it. Never in the Studio preview (its canvas shows the unsaved draft).

let snapshot: { path: string; html: string } | null = null;

/** Called once, before React mounts: remembers the server-rendered page in #root, if there is one. */
export function keepPrerenderedPage(root: HTMLElement | null) {
  if (typeof window === "undefined" || !root?.firstElementChild) return;
  if (new URLSearchParams(window.location.search).get("preview") === "true") return;
  snapshot = { path: window.location.pathname, html: root.innerHTML };
}

/** The landing page's HTML while the app is still taking over on that same address; else null. */
export function prerenderedHtml(pathname = typeof window === "undefined" ? "" : window.location.pathname): string | null {
  return snapshot && snapshot.path === pathname ? snapshot.html : null;
}

/** True while the page now mounting replaces the HTML the visitor already sees (skip its entrance animations). */
export const arrivedPrerendered = () => prerenderedHtml() !== null;

/** First navigation (or the page reporting itself ready to animate again): back to normal loading. */
export function endPrerenderedHandoff() { snapshot = null; }

const HOLD_MS = 5000;

/**
 * Wraps a lazy page import. On the landing page with a server-rendered copy, the code resolves only once the shop
 * data is in too (at most HOLD_MS), so the page's first render already has its books instead of a loading state.
 */
export function whenPrerenderedReady<T>(load: () => Promise<T>, data: () => Promise<unknown> | null): () => Promise<T> {
  return () => {
    const code = load();
    if (!arrivedPrerendered()) return code;
    const ready = data();
    if (!ready) return code;
    const hold = Promise.race([ready.catch(() => undefined), new Promise(resolve => setTimeout(resolve, HOLD_MS))]);
    return Promise.all([code, hold]).then(([module]) => module);
  };
}
