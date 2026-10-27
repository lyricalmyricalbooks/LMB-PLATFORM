import type { AppUpdate } from "../appUpdates";

export default {
  id: "test-shop-sold-out",
  date: "2026-10-27",
  title: "The test shop's test purchases check for sold-out books",
  summary: "Only the platform's own test shop changes: if a test purchase there finishes after its 30-minute hold ran out and the book sold out in the meantime, the order is not marked paid and is flagged for review, the same as a real purchase. That lets the automatic test purchase catch a broken sold-out check before an update reaches your shop. In your shop nothing changes: test-card purchases still leave your stock alone, and real purchases are checked as before.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
