import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-url-state",
  date: "2026-10-23",
  title: "Optional: shop filters kept in the page address",
  summary:
    "Like Shopify collection pages, the shop can now remember a shopper's search, sort order and filters (in stock, on sale, format, price) in the page address. A shopper who opens a book and presses Back returns to exactly the list they were browsing, and a filtered view such as \"e-books under $20\" can be bookmarked or sent to a friend. It is off until you switch it on in Design › Theme settings › Shop page heading & filters › Book order, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
