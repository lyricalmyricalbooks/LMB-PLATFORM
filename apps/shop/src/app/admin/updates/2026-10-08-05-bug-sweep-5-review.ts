import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-sweep-5-review", date: "2026-10-08", title: "Cancelling checks Stripe first",
  summary: "Cancel unpaid order now asks Stripe before cancelling, and refuses when the customer has already paid there. Disputed parcels already on their way can still be marked delivered. The bag's free-shipping bar only appears when every shipping option really becomes free.",
  links: [{ label: "Review orders", tab: "orders" }, { label: "Check free-shipping rules", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
