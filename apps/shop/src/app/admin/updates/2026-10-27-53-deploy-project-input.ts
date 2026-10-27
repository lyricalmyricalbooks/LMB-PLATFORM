import type { AppUpdate } from "../appUpdates";

export default {
  id: "deploy-project-input",
  date: "2026-10-27",
  title: "Updates to your shop always go to your shop's own project",
  summary: "Publishing your shop and its server code no longer names a fixed Google Cloud project. Each update is sent to the project in your shop's settings, and an update aimed at any other project stops before anything changes, so one shop's update can never land in another shop.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
