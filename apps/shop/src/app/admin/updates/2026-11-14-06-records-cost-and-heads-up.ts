import type { AppUpdate } from "../appUpdates";

export default {
  id: "records-cost-and-heads-up",
  date: "2026-11-14",
  title: "Your shop records cost, day by day, and a heads-up on Alerts",
  summary: "Billing's running costs now count your share of the shop records as the month goes, instead of showing nothing until the month closes, so the estimate is closer to the real bill. Photos and records you keep are no longer counted as if they piled up every day. And when a month looks set to pass the amount you chose, the Alerts page tells you as well as the email.",
  links: [{ label: "Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
