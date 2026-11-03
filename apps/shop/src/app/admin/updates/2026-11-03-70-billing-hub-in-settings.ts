import type { AppUpdate } from "../appUpdates";

export default {
  id: "billing-hub-in-settings",
  date: "2026-11-03",
  title: "Your plan and bills now live in Settings",
  summary: "Settings, Plan now lets you compare and change plans, see what a change costs before you make it, choose how you pay, and cancel or keep your plan. The new Settings, Billing page shows your next bill line by line, your saved cards (make one primary or remove one), your billing details with a GST/HST number for your bills, every past bill to download, and a Pay now button if a payment is declined. Founding presses now see their 25% off on every bill.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }, { label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
