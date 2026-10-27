import type { AppUpdate } from "../appUpdates";

export default {
  id: "wishlist-share",
  date: "2026-10-21",
  title: "Shareable wishlists (off until you switch it on)",
  summary: "Shoppers can send their wishlist to a friend as a link. The link opens a shared list with Save to my wishlist and Add all to bag. Nothing is stored: the books travel in the link itself. It is off by default, so the live shop doesn't change. To try it: Studio › Theme settings › Book cards in the shop grid › Title & price › Wishlist share button, then open the wishlist in the preview. Its words are in Text & labels › Collection & wishlist pages.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer" }],
} satisfies AppUpdate;
