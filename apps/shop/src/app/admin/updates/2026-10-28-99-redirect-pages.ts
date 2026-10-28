import type { AppUpdate } from "../appUpdates";

export default {
  id: "redirect-pages",
  date: "2026-10-28",
  title: "Room for 5,000 old links",
  summary: "URL redirects now keep up to 5,000 old addresses instead of 500, so a big catalog brought over from your old shop keeps all its product links working. Your existing redirects carry on as they are. The list shows how many you have used, has a find box when it gets long, and bringing books over tells you plainly if your shop runs out of room.",
  links: [{ label: "Open URL redirects", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
