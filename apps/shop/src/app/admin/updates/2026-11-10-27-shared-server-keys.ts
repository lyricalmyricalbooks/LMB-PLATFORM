import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-server-keys",
  date: "2026-11-10",
  title: "Shop server ready for the shared system",
  summary: "The shop's server no longer asks for payment, email or shipping keys of its own when it runs on the platform, so it can be sent to the shared project. Payments and email go through the platform as before.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
