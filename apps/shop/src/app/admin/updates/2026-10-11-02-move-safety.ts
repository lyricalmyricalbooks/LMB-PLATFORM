import type { AppUpdate } from "../appUpdates";

export default {
  id: "move-safety", date: "2026-10-11", title: "Safer move to the new address",
  summary: "This release tightens what happens when visitors arrive from the old GitHub Pages address. A shopper's bag still comes along, but a gift card can no longer be slipped into it by a crafted link, so a paid gift card's code can never be sent to a stranger. If a shopper returns from paying and then tries again, the shop still recognises the earlier payment and won't charge twice. A very full bag no longer stops the order confirmation from opening after a payment. Visits forwarded from Google, Instagram and other sites are counted under that source again in Overview, instead of as \"direct\" (only when the shopper allows analytics). Adding your own domain later now needs it to be connected in Firebase Hosting and opening the shop before the SITE_URL setting takes effect: a mistyped or not-yet-ready domain is refused rather than sending visitors to a dead address. docs/FIREBASE_HOSTING.md has the steps.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
