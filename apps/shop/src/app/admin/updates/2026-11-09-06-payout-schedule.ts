import type { AppUpdate } from "../appUpdates";

export default {
  id: "payout-schedule",
  date: "2026-11-09",
  title: "See when Stripe pays you",
  summary: "Settings › Payments now says when Stripe sends your sales to your bank, such as every day or every Friday, instead of a general line.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
