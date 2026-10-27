import type { AppUpdate } from "../appUpdates";

export default {
  id: "card-formats",
  date: "2026-10-22",
  title: "Optional formats line on shop cards",
  summary:
    "Like Shopify themes that show “available in 3 colours” under a product, the shop grid can now list the formats a book comes in (for example Paperback · Hardcover · E-book) under its title and price, so shoppers looking for an e-book or a hardcover spot it without opening every book. Only books sold in two or more formats get the line; everything else looks exactly as before. The format names are the same words as the shop's format filter. It is off until you switch it on in Design › Theme settings › Book cards in the shop grid › Grid & columns, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
