import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-payment-icons",
  date: "2026-10-23",
  title: "Optional payment icons under the buy buttons",
  summary:
    "Like many Shopify themes, book pages can now show the card and wallet logos you accept (Visa, PayPal and so on) right under the Add to bag button, so shoppers see how they can pay before they reach checkout. It uses the same logos you pick for the footer, hides while a book can't be bought, and changes nothing about which payment methods checkout offers. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
