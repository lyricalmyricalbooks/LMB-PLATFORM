// The fixed "taking a short break" page (code plan 6.7). Pure and tested (shopBreak.test.ts).
//
// The platform writes the public `platform/status` document ({ access: "open" | "paused" | "closed" }) into the shop's
// database whenever its plan changes (services/billing/shopPlan.js in the platform repo); no browser can write it
// (firestore.rules). While the plan is paused or closed the storefront shows the maintenance page with the words below
// instead of the shop. They are locked on purpose, unlike every other shopper-facing word: the owner can't turn this
// page off or change it from Studio or Settings, because it follows the plan. Adding a card on the platform's Plan &
// billing page opens the shop again. The shop's server refuses new orders meanwhile (functions/shopSettings.js
// planPaused), whatever this page shows.

export type ShopBreak = "paused" | "closed";

/** "paused" or "closed" from the status document; null for an open shop or a shop with no plan document. */
export function shopBreakState(status: unknown): ShopBreak | null {
  if (!status || typeof status !== "object") return null;
  const access = (status as { access?: unknown }).access;
  if (access === "open" || access === undefined) return null;
  // Anything else the shop doesn't recognise counts as a break, never as open.
  return access === "closed" ? "closed" : "paused";
}

/** The locked words, by state. */
export const SHOP_BREAK_WORDS: Record<ShopBreak, { tag: string; title: string; message: string; footer: string }> = {
  paused: {
    tag: "Back soon",
    title: "Taking a short break",
    message: "This shop is taking a short break and isn't taking orders right now. Please check back soon.",
    footer: "Thank you for your patience",
  },
  closed: {
    tag: "Closed",
    title: "This shop is closed",
    message: "This shop isn't taking orders. Thank you for visiting.",
    footer: "Thank you",
  },
};
