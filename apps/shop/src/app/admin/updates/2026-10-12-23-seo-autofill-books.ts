import type { AppUpdate } from "../appUpdates";

export default {
  id: "seo-autofill-books",
  date: "2026-10-12",
  title: "Auto-fill book search listings, and see how pages look in Google",
  summary:
    "Books › edit › Search (SEO) has an Auto-fill from book button. It writes the search title as \"Title by Author — shop name\", dropping the author or shop name when that would be longer than 60 characters, and the description from the book description's opening sentences. A book with no description gets a sentence built from its real format, page count and publisher. It fills only blank boxes and asks before replacing written ones; nothing is saved until you save the book. In the Design studio's Pages tab, the title length check now counts the shop name the site adds to every page title, and a search preview shows the page roughly as Google would list it. Find anything (Ctrl/⌘ K) can also run Fill in missing search listings for every page.",
  links: [
    { label: "Open Books", tab: "catalog" },
    { label: "Open the Design studio", tab: "settings", settingsTab: "designer" },
  ],
} satisfies AppUpdate;
