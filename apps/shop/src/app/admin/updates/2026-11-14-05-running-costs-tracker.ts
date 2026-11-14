import type { AppUpdate } from "../appUpdates";

export default {
  id: "running-costs-tracker",
  date: "2026-11-14",
  title: "See what your shop costs to run, as the month goes",
  summary: "Billing now shows your running cost so far this month, where the month is heading, and about what the bill will be with your fee, any founding discount and tax. You can see what the money went on (visitors, photos, orders, emails), compare with past months, and see whether you are on track against the amount you asked to be emailed about. The figures are estimates until the month closes.",
  links: [{ label: "Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
