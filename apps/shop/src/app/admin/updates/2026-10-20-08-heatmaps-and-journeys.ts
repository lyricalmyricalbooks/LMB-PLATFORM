import type { AppUpdate } from "../appUpdates";

export default {
  id: "heatmaps-and-journeys",
  date: "2026-10-20",
  title: "Heatmaps, recordings and full visitor journeys",
  summary: "Two optional connections show even more about how people move through the shop. Microsoft Clarity (free) adds heatmaps of where visitors click and scroll, and recordings of real visits: paste your Clarity project ID in Settings › General › Visitors & Google. It never records checkout, your account pages, order tracking or the admin, and it follows the same cookie choice as Google Analytics. Visitor journeys and Last page before leaving (Overview › Visitors) read Google Analytics' free daily BigQuery export to show the most common four-page paths and where visits end: link BigQuery in Google Analytics › Admin › Product links, then give the shop's server account the two BigQuery roles the settings card names. Both widgets say what is still needed until it's set up. The journey queries are capped so they stay free.",
  links: [{ label: "Overview", tab: "overview" }, { label: "General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
