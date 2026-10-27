import type { AppUpdate } from "../appUpdates";

export default {
  id: "visitors-chart-empty",
  date: "2026-10-22",
  title: "Visitors chart no longer shows a fake zero",
  summary: "When Google Analytics returns no visitors for the chosen days, the Overview's Visitors chart now shows the shop's own visit counter instead, with a note saying so. If neither has anything, it says “No visitors recorded” rather than drawing a flat line at 0 and −100%. Overview and Settings › General › Google Analytics › Check connection also warn when the Google Analytics property being read doesn't contain the shop's tag, which makes Google return nothing. This needs the server update that deploys with it.",
  links: [{ label: "Open Overview", tab: "overview" }, { label: "Check Google Analytics", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
