import type { AppUpdate } from "../appUpdates";

export default {
  id: "shipping-problems-on-tabs",
  date: "2026-10-20",
  title: "Shipping problems now take you to where they're fixed",
  summary: "In Settings › Shipping, every problem under Overview › Checkout readiness has a button that opens the tab where you fix it (Profiles or Carrier & labels). Those two tabs show how many problems they have and list just their own at the top. Carrier & labels also warns when Shippo is on a TEST key, or when live carrier rates are on but no country is ticked. How shipping is charged hasn't changed.",
  links: [{ label: "Shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
