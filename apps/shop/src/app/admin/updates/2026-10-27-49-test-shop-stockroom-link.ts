import type { AppUpdate } from "../appUpdates";

export default {
  id: "test-shop-stockroom-link",
  date: "2026-10-27",
  title: "The test shop's test purchases reach its stockroom",
  summary: "Only the platform's own test shop changes: its test-card purchases now go to its stockroom like real sales, so the stockroom count goes down, and refunds bring it back. That lets the automatic test purchase check the shop-to-stockroom link before an update reaches your shop. In your shop nothing changes: test-card purchases still go to your stockroom only as practice runs, which it never counts.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
