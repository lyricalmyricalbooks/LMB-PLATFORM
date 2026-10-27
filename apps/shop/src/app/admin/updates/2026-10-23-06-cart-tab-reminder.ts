import type { AppUpdate } from "../appUpdates";

export default {
  id: "cart-tab-reminder",
  date: "2026-10-23",
  title: "Optional tab reminder for shoppers with books in their bag",
  summary:
    "Like the popular Shopify “tab reminder” apps, the shop can now nudge a shopper who wanders off: when someone with books in their bag switches to another browser tab, the shop's tab title changes to “(2) Your books are waiting”, and their own page title comes back the moment they return. It never shows on an empty bag, in the admin or in the Studio preview, and it changes nothing about prices or checkout. It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Total & checkout button › Tab reminder, so the live shop is unchanged. The words are in Text & labels › Cart › Tab reminder.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
