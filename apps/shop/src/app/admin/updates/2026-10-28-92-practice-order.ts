import type { AppUpdate } from "../appUpdates";

export default {
  id: "practice-order",
  date: "2026-10-28",
  title: "Try a practice order before your shop opens",
  summary: "If your card payments go through Colophon, Settings › Payments › Test sale walkthrough now has a Try a practice order button. It works while your shop is private (checkout paused or the under construction wall up). For one hour your own checkout, and nobody else's, pays with a test card, so you can place an order, see the confirmation email and refund it. Practice orders hold and take stock like real ones, are marked as test orders, and never count in your reports or exports. The walkthrough for these shops is now four simple steps: start, pay, see the email, refund.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
