import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-show-more",
  date: "2026-10-22",
  title: "Optional “Show more books” button for the shop grid",
  summary:
    "Like Shopify's collection paging, the shop grid can now show a set number of books with a “Show more books” button and a “Showing 12 of 40” line underneath. It is off until you choose a number in Design › Theme settings › Shop page heading & filters › Show more button, so the live shop is unchanged. Changing the category, search, sort or filters starts again from the first books. The button's words are in Text & labels › Catalog & empty states.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
