import type { AppUpdate } from "../appUpdates";

export default {
  id: "test-shop-stock",
  date: "2026-10-27",
  title: "Test purchases on the platform's test shop now use up stock",
  summary: "Only the platform's own test shop changes: a test-card purchase there now takes the book out of stock, and refunding it puts the book back, exactly like a real sale. That lets the automatic test purchase prove stock counts still work before an update reaches your shop. In your shop nothing changes: test-card purchases still leave your stock alone, and real sales and refunds work as before.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
