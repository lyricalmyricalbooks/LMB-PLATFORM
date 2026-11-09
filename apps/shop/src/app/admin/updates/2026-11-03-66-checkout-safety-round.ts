import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-safety-round",
  date: "2026-11-03",
  title: "Fairer tax on discounts, bigger trade orders, and gift cards wait for your check",
  summary: "When some products have their own tax rate, a discount on only some products now lowers the tax on those products only, so the tax charged is right. An approved stockist can now order more copies than a shopper may hold at once, as long as you have them in stock. When an order is waiting for your check (Check big orders, or a payment that looks risky), its gift cards are now emailed only after you press It looks fine. Your daily and Monday emails no longer arrive twice when the shop is busy, and a shopper's own copy of their data is quicker and limited to a few an hour.",
  links: [{ label: "Open orders", tab: "orders" }, { label: "Open Payments settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
