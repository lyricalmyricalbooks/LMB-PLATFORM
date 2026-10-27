import type { AppUpdate } from "../appUpdates";

export default {
  id: "payment-provider-strict",
  date: "2026-10-27",
  title: "A mistyped payment company setting is caught before it reaches checkout",
  summary: "Maintenance only: if your shop's server is set up to use a payment company the shop can't use yet, or the name has a typo, the server now refuses to start and says exactly which setting to fix. Before, it quietly used Stripe instead, and checkout could have failed in front of a shopper. Shops that use Stripe see no change.",
  links: [{ label: "Open Payments settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
