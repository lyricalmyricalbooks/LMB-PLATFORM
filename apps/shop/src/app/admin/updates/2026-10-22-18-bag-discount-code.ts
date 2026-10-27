import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-discount-code",
  date: "2026-10-22",
  title: "Optional discount code box in the shopping bag",
  summary:
    "Like many Shopify themes, the shopping bag can now show a small “Have a discount code?” link above the total. A shopper types the code there and checkout fills it in and checks it, exactly as if it had been typed at checkout, so the bag never promises a saving the code doesn't give (a code that doesn't apply is explained at checkout). A code from a shared discount link shows there too, with Remove. It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Total & checkout button › Discount code box, so the live shop is unchanged. The words are in Text & labels › Cart › Discount code box.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
