import type { AppUpdate } from "../appUpdates";

export default {
  id: "sold-out-last",
  date: "2026-10-22",
  title: "Optional: sold-out books move to the end of the shop",
  summary:
    "Like Shopify's “push sold-out products to the end” setting, the shop grid can now list books shoppers can buy first and sold-out ones after them, so the first row a visitor sees is never full of books they can't order. Whatever order shoppers pick (Featured, price, newest, A → Z) still applies inside each group, and coming soon books keep their place. Sold-out books stay visible and searchable. It is off until you switch it on in Design › Theme settings › Shop page heading & filters › Book order, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
