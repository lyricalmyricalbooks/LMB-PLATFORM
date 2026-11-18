import type { AppUpdate } from "../appUpdates";

export default {
  id: "memberships-server",
  date: "2026-11-18",
  title: "Memberships can now run behind the scenes (Beta)",
  summary: "Your shop can now keep membership plans, sign a customer up on your card page, follow each payment, and email the member when they join, when a payment fails, when they choose to end and when it ends. Customer data requests cover memberships too: erasing someone's data waits until their membership is ended, so nobody is charged by a shop that no longer knows them. The Members page and the sign-up page come next, and Memberships stays off until it is switched on for your shop.",
  links: [{ label: "Ways to sell", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
