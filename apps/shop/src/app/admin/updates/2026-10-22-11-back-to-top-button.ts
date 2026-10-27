import type { AppUpdate } from "../appUpdates";

export default {
  id: "back-to-top-button",
  date: "2026-10-22",
  title: "Optional “Back to top” button",
  summary:
    "Like many Shopify themes, the shop can now show a small “Back to top” button in a bottom corner once a shopper has scrolled well down a long page (the shop grid, a book page, a custom page). One tap brings them back to the menu. On phones it shows just an arrow, and on a book page it moves up out of the way of the sticky add-to-bag bar. It is off until you switch it on in Design › Theme settings › Footer & social links › What the footer shows, so the live shop is unchanged. The words are in Text & labels › Footer.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
