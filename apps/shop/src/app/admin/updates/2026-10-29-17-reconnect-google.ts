import type { AppUpdate } from "../appUpdates";

export default {
  id: "reconnect-google",
  date: "2026-10-29",
  title: "If Google stops letting your shop in, you'll see a Reconnect button",
  summary: "When Google ends the link (for example after you change your Google password), Settings now says so with a Reconnect Google button instead of failing quietly. Your shop keeps working, and your order emails go out from Colophon's address until you reconnect, so no customer goes without one.",
  links: [{ label: "Open Google settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
