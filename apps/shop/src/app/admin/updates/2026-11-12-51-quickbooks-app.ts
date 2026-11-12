import type { AppUpdate } from "../appUpdates";

export default {
  id: "quickbooks-app",
  date: "2026-11-12",
  title: "QuickBooks is in the app store",
  summary: "QuickBooks now sits in Settings › Apps with your other apps, instead of on a page of its own. It shows Coming soon until it's switched on for your shop. Once you connect it, it's listed under Installed with a Manage button.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
