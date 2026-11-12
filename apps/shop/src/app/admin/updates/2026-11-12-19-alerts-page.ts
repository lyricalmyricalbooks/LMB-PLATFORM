import type { AppUpdate } from "../appUpdates";

export default {
  id: "alerts-page",
  date: "2026-11-12",
  title: "Alerts have their own page",
  summary: "Alerts no longer stack up above every page. A small pill in the top bar shows how many there are (red when one is urgent) and opens the Alerts page, where each one is a tile with its fix and Hide for now. The email alerts are in plainer words.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
