import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-pickers", date: "2026-10-09", title: "Pick links, books and categories instead of typing them",
  summary: "In the Design studio, a section's link fields (button and card links) now have a Choose button: pick a store page (Home, Shop, Wishlist, Account, Order tracking), one of your custom pages, a shop category or a book, or still type any web address. Book grids and the cover carousel have \"Which books\": all books, featured, books you pick from a searchable list, a shop category, newest, on sale or pre-orders, plus an Order setting (shop order, the order you picked, newest, title or price). Featured product and the staff notes table pick their book from the catalog, video fields tell you straight away whether a link will play, and the page title font is chosen from the font list. Sections you already set up keep showing the same books and links — nothing needs redoing. These are design settings only; prices, stock and checkout are unchanged.",
  links: [{ label: "Open Page layout", tab: "settings", settingsTab: "designer", studio: "#designer?tab=sections" }],
} satisfies AppUpdate;
