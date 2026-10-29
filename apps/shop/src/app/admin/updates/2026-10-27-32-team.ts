import type { AppUpdate } from "../appUpdates";

export default {
  id: "team",
  date: "2026-10-27",
  title: "Add people to your admin under Settings › Team",
  summary: "You can now let other people open the admin with their own Google account. Staff can do everything except change the Team or the payment and email settings; another owner can do everything. Removing someone signs them out of the admin.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
