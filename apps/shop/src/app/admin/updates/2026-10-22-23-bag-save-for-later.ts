import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-save-for-later",
  date: "2026-10-22",
  title: "Optional “Save for later” in the shopping bag",
  summary:
    "Like the save-for-later link in many Shopify carts, each book in the shopping bag can now show “Save for later” beside Remove. It takes the book out of the bag and puts it on the shopper's wishlist, so a book they aren't ready to buy isn't lost, with an Undo in the message that puts everything back. Gift cards don't show it. It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Book rows › Save for later button, so the live shop is unchanged. The words are in Text & labels › Cart › Save for later.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
