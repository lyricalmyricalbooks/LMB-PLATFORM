import type { AppUpdate } from "../appUpdates";

export default {
  id: "audit-2026-10-21-private-noindex-photo-keys",
  date: "2026-10-21",
  title: "Weekly check: private pages marked noindex, book photos reachable by keyboard",
  summary: "From this week's speed, accessibility and search check of the live shop. Checkout, order tracking, wishlist, account and admin addresses now tell search engines not to list them in the page's response itself, like the bag already did (robots.txt still asks crawlers to skip them). On a book page with several photos, the photo strip can now be reached with the Tab key and moved with the arrow keys, with a focus outline drawn inside the photo. Nothing changes for mouse or touch shoppers and no design setting changed. Checked with the automated tests and a local build; it takes effect once the storefront is deployed. Larger findings (text contrast, a font-loading shift on short pages, phone speed, page structure) are written up as maintenance issues for review.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
