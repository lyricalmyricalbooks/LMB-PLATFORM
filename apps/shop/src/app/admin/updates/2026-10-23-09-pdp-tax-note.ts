import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-tax-note",
  date: "2026-10-23",
  title: "Optional “Taxes and shipping calculated at checkout” note on book pages",
  summary:
    "Like Shopify themes, a book page can now say “Taxes and shipping calculated at checkout.” right under the price, so shoppers aren't surprised by the total. The word “shipping” links to your shipping policy when you have written one. Printed books mention shipping, e-books only mention tax, gift cards show nothing, and if you've switched off collecting sales tax the tax part is dropped. It is display only: checkout still works out tax and shipping exactly as before. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
