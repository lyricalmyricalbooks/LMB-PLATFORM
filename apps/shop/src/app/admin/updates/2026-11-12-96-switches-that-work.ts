import type { AppUpdate } from "../appUpdates";

export default {
  id: "switches-that-work",
  date: "2026-11-12",
  title: "Payment and tax switches now do what they say",
  summary: "Turning PayPal or Stripe checkout off now stops those payments everywhere, Apple Pay and Google Pay follow their switches, a product with Charge sales tax off is charged no tax, and emails sent through Colophon carry your shop's name.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }, { label: "Open Products", tab: "catalog" }],
} satisfies AppUpdate;
