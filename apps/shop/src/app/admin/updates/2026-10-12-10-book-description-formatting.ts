import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-description-formatting",
  date: "2026-10-12",
  title: "Links and formatting in book descriptions",
  summary:
    "Book descriptions can now hold links, bold, italic, headings, bullet and numbered lists, quotes and divider lines. In Books › edit a book › Details, select words in Description and use the toolbar above it; Add link asks for the link text and web address, and Preview shows how it will read. Links open in a new tab on the product page, and search results and sharing previews still use the plain words. A web address typed on its own becomes a link too. The look is in Design › Style › Product page · buy card & details › Description text: font, size (desktop and phone), line spacing, colour, alignment, link colour and underline, heading font, size and colour, quote bar colour and the space around headings and lists. Descriptions without formatting look the same as before.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
