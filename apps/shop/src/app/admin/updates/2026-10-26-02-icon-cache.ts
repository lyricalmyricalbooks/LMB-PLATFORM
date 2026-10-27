import type { AppUpdate } from "../appUpdates";

export default {
  id: "icon-cache",
  date: "2026-10-26",
  title: "Shop icons are remembered by visitors' browsers for a week",
  summary: "The small tab and home-screen icons are now kept by a visitor's browser for a week instead of being checked again every hour, so repeat visits make a few fewer requests. Nothing changes in how the shop looks; if you replace an icon in Studio, the new one is still picked up.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
