import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-server-no-own-keys",
  date: "2026-11-10",
  title: "Shared server setup no longer stops",
  summary: "Setting up a shop on the shared system no longer stops to ask for the press's own email or payment sign-ins. Email and payments go through the platform.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
