import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-shipping-returns-tab",
  date: "2026-10-22",
  title: "Optional Shipping & returns tab on book pages",
  summary:
    "Like the “Shipping & returns” row in Shopify themes, book pages can now show a Shipping & returns tab next to Description and Details. It shows your own Shipping policy and Returns policy exactly as written in Settings › General › Store policies, with a link to each full policy page — nothing is made up. Printed books show both; e-books and gift cards show only the returns policy, and the tab hides when neither policy is written. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The tab name and link words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Store policies", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
