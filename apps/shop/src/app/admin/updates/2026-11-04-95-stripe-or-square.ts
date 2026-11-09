import type { AppUpdate } from "../appUpdates";

export default {
  id: "stripe-or-square",
  date: "2026-11-04",
  title: "Pick Stripe or Square, and everything works with either",
  summary: "While you set up, Settings › Payments now lets you pick Stripe or Square for your website's card payments, and the review before Create my shop shows your pick. On Square, shoppers who browse in another currency now pay in your Square account's currency instead of meeting an error, fair helpers can take card payments by QR code, opening a Square order checks its payment and offers Sync with Square, a refund Square turns down no longer blocks later returns, and the starter privacy and accessibility policies name Square. The stockroom's invoices and fair-day summary no longer say Stripe when you don't use it.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
