import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-preview-clicks-and-links",
  date: "2026-10-12",
  title: "Clicking and browsing in the Studio preview work more reliably",
  summary:
    "A single click on header or footer words (like Search) now opens that part in the Design studio instead of doing nothing. When the same part repeats (wishlist cards, search results), the outline stays on the one you clicked. Sections under the header and pop-up sections now get the canvas toolbar and double-click text editing too. Following a link inside the preview moves Studio to that page, a book link edits the book's own page template, and the logo goes to the catalog when Show a Home page is off. Page layout › Pop-overs › Cookie banner › Open in preview shows the banner even if you've answered it, without changing your answer. The pop-up's Hide on phones now applies in the phone preview. Outline rows say when a section is scheduled or hidden at the previewed size. A refused double-click edit says so instead of snapping back. Pay is switched off in the checkout preview, so no order or payment can be made from Studio.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
