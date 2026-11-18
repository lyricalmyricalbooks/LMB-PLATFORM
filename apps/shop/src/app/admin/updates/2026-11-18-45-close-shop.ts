import type { AppUpdate } from "../appUpdates";

export default {
  id: "close-shop",
  date: "2026-11-18",
  title: "Close your shop with one button",
  summary: "Settings › Close shop is its own page now. Download everything, then press Close shop and answer a plain yes or no. A month you've paid for runs to its end first; a free trial closes today. You have 90 days to open it again, with reminder emails before anything is deleted.",
  links: [{ label: "Close shop", tab: "settings", settingsTab: "close" }],
} satisfies AppUpdate;
