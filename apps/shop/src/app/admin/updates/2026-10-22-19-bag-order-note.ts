import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-order-note",
  date: "2026-10-22",
  title: "Optional order note box in the shopping bag",
  summary:
    "Like a Shopify cart note, the shopping bag can now show “Add a note to your order” above the total, for gift messages or special requests. The note is kept while the shopper browses, appears again in the order note box at checkout (which switches on with it) so they can check it before paying, and arrives on the order where you already see notes: Orders › the order › Customer. It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Total & checkout button › Order note box, so the live shop is unchanged. The words are in Text & labels › Cart › Order note box.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
