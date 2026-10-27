import type { AppUpdate } from "../appUpdates";

export default {
  id: "test-shop-holds",
  date: "2026-10-27",
  title: "Test purchases on the platform's test shop now hold stock",
  summary: "Only the platform's own test shop changes: when it buys a book with a test card, the copy is now held for the shopper during checkout, the same as a real purchase. That lets the automatic test purchase catch a broken stock hold before an update reaches your shop. Nothing changes in your shop: test-card checkouts there still hold no stock, and real checkouts work exactly as before.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
