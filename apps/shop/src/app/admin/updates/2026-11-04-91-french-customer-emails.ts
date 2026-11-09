import type { AppUpdate } from "../appUpdates";

export default {
  id: "french-customer-emails",
  date: "2026-11-04",
  title: "Customer emails in French, and a \"picked up\" email",
  summary: "A customer who shops with your shop in French now gets their order emails in French: the confirmation, shipping, refunds, gift cards and the rest, including the totals and delivery lines. Each email in Settings, Notifications has an English and a French tab, so you can change the French words too; one switch still turns both off. Customers who pick up an order in person now get a thank-you email when you mark it collected, which they can keep as their receipt. And the two-step sign-in safety emails to your team come in French when your shop is in French.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
