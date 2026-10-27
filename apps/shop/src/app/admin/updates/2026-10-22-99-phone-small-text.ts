import type { AppUpdate } from "../appUpdates";

export default {
  id: "phone-small-text",
  date: "2026-10-22",
  title: "Small labels are easier to read on phones",
  summary: "On a phone, the book page's tabs, tags, detail names and the order tracking labels no longer drop below 12px (it follows Style › Small print & labels › Smallest text on phones), the tracking links are easier to tap, and the search drawer shows a plain ✕ to close instead of the keyboard word Esc. Computers and tablets look the same.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
