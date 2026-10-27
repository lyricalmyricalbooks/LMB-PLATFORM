import type { AppUpdate } from "../appUpdates";

export default {
  id: "header-hide-on-scroll",
  date: "2026-10-22",
  title: "Optional header that tucks away while scrolling",
  summary:
    "Like Shopify's “sticky header on scroll up” setting, the shop header can now slide out of the way while a shopper scrolls down a page, giving the books more room on small screens, and slide straight back the moment they scroll up. It never hides near the top of the page or while someone is using the menu with a keyboard, and on a book page the buy box moves up into the freed space. It is off until you switch it on in Design › Theme settings › Header & announcement bar › Header layout, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
