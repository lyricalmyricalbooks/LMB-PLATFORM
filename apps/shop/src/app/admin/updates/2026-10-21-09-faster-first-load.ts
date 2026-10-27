import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-first-load",
  date: "2026-10-21",
  title: "Shop pages download less up front, and every change is click-tested",
  summary: "Shop pages now download about 18 KB less before they appear: the search box and pop-up messages load when they're first needed, and the light/dark switch no longer pulls in a class-merging library. Nothing looks different. Every pull request now also runs a shopper click-through in a real browser (home, a book, add to bag, checkout, collections, wishlist, tracking, account, 404, search, phone); it rejects cookies and pays nothing, so it never touches your sales or visitor numbers.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
