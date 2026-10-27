import type { AppUpdate } from "../appUpdates";

export default {
  id: "card-creator",
  date: "2026-10-23",
  title: "Optional author or artist line on shop cards",
  summary:
    "Like Shopify themes that can show the brand under each product, the shop grid can now show who made each book (the Author / contributors credit you type in Books › edit) under its title and price, so shoppers browsing for an artist they know find them at a glance. Books with no credit look exactly as before. It is off until you switch it on in Design › Theme settings › Book cards in the shop grid › Grid & columns, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
