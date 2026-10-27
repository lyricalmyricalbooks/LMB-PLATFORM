import type { AppUpdate } from "../appUpdates";

export default {
  id: "recent-searches",
  date: "2026-10-13",
  title: "Search pop-up: recent searches",
  summary: "When a shopper opens search before typing, the pop-up now shows the last few things they opened or searched for, with a Clear button. They are kept only in that browser. Turn the row off in Studio › Theme settings › Catalog page header & filters; change its words in Text & labels › Search & filters.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
