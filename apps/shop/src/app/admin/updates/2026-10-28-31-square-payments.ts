import type { AppUpdate } from "../appUpdates";

export default {
  id: "square-payments",
  date: "2026-10-28",
  title: "Take cards with Square, and see Colophon's fee",
  summary: "A shop set up by Colophon can now take cards with Square instead of Stripe. Press Connect Square in Settings › Payments and sign in to your own Square account. Shoppers then pay on Square's secure checkout page and come back to your shop for their receipt. Refunds and payment checks work as before. The same card also shows whether your account can take cards and how much Colophon keeps from each sale.",
  links: [{ label: "Open Card payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
