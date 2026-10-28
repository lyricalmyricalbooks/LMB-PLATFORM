import type { AppUpdate } from "../appUpdates";

export default {
  id: "square-gift-cards",
  date: "2026-10-28",
  title: "Gift cards work with Square checkout",
  summary: "If your shop takes cards through Square, shoppers can now use a gift card and pay the rest by card. The gift card pays first. Square's payment page shows it as a \"Gift card\" line and charges the card only what is left. A partial refund comes off the card, never more than the card paid. A full refund gives back the card payment, then puts the money back on the gift card.",
  links: [{ label: "Open Gift cards", tab: "giftCards" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
