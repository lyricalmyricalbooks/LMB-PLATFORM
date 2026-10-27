import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-pop-up-messages",
  date: "2026-10-13",
  title: "Design studio: style the short pop-up messages shoppers see",
  summary: "The quick messages that appear for a few seconds on the shop (“Removed from your bag · Undo”, “Link copied”, add-to-bag problems, account notices) now have their own Studio controls: where they appear (top or bottom, left, centre or right), background, text colour, text size, letter spacing, corner rounding, an outline and how wide they can get. Find them in Settings › Design › Theme settings › Site-wide design › Pop-up messages. Nothing changes until you set something: they keep today's look. Their words stay in Text & labels.",
  links: [{ label: "Open Pop-up messages", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
