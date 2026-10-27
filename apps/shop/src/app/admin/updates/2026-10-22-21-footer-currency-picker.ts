import type { AppUpdate } from "../appUpdates";

export default {
  id: "footer-currency-picker",
  date: "2026-10-22",
  title: "Optional currency picker in the footer",
  summary:
    "Like the country/currency picker at the bottom of most Shopify themes, the shop can now show a “Currency” drop-down in the footer’s bottom bar (Canadian dollar, US dollar, euro). It changes the same setting as the picker in the header, so every price on the page switches together, and checkout still charges what it does today. It is off until you switch it on in Design › Theme settings › Footer & social links › What the footer shows › Currency picker in the footer, so the live shop is unchanged. The words are in Text & labels › Footer.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
