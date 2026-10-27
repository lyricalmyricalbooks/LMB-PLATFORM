import type { AppUpdate } from "../appUpdates";

export default {
  id: "card-hover-photo",
  date: "2026-10-22",
  title: "Optional second photo when shoppers point at a book",
  summary:
    "Like Shopify themes' “show second image on hover”, the shop grid can now fade to a book's second photo (an inside spread, the back cover) while a shopper's mouse is over its card. Books with only one photo keep their cover, sold-out books stay as they are, and phones and tablets are unchanged because a tap opens the book. The second photo is only downloaded when someone actually points at that book, so it doesn't slow the shop down. It is off until you switch it on in Design › Theme settings › Book cards in the shop grid › Grid & columns, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
