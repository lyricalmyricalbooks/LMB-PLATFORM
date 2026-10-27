import type { AppUpdate } from "../appUpdates";

export default {
  id: "card-rating",
  date: "2026-10-23",
  title: "Optional star ratings on shop cards",
  summary:
    "Like Shopify themes' \"Show product rating\", the shop grid can now show each book's stars and number of reviews under its title, so shoppers can spot well-loved books while browsing. Only reviews you have approved count, and books with none look exactly as before. A book's rating is looked up only when its card scrolls near the screen. It is off until you switch it on in Design › Theme settings › Book cards in the shop grid › Grid & columns, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Reviews", tab: "reviews" },
  ],
} satisfies AppUpdate;
