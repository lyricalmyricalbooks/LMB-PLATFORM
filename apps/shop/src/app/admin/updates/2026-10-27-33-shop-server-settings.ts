import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-server-settings",
  date: "2026-10-27",
  title: "Your shop's server knows whose shop it is",
  summary: "Behind the scenes, the owner's address, the address order emails come from and the shop's web address now come from your shop's own settings instead of being written into the code. Nothing changes on your screens; this is groundwork so each shop runs with its own details.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
