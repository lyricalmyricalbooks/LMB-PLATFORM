import type { AppUpdate } from "../appUpdates";

export default {
  id: "audit-sweep", date: "2026-10-09", title: "Fixes from a full-site check: shop pages, menus and search listings",
  summary: "The shop no longer shows an error page on older phones and browsers. If you remove every shop category, the catalog now shows all your books instead of none. The wishlist heart on book covers is visible on phones, so a tap on the corner of a cover no longer adds a book to the wishlist by surprise. A book you published a moment ago shows a short loading state instead of 'Book not found'. Category drop-downs line up under their button when the announcement bar is showing. Book, page and collection addresses are saved in a way that should let Google read them without a redirect; once this is live, check that a book address opens directly. Tested with local checks only.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
