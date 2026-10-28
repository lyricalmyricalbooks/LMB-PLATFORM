import type { AppUpdate } from "../appUpdates";

export default {
  id: "platform-payments",
  date: "2026-10-28",
  title: "Card payments without your own Stripe keys",
  summary: "On a shop set up by Colophon, card payments go straight to your own Stripe account without you pasting any keys. The card form on the checkout page, refunds and payment checks all work the same as before. Your money still goes to your Stripe account, and Stripe pays it out to you.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
