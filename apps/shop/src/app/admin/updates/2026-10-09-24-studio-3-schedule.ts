import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-3-schedule", date: "2026-10-09", title: "Schedule a design, or run a campaign that switches back by itself",
  summary: "You can now set a design to go live at a chosen time, or run a campaign — for example a sale look from Friday 9 a.m. until the next Sunday night — after which the shop goes back to the design it had before. Open the Design studio and choose Theme actions › Schedule publishing…, or Schedule instead… when you press Publish, or Schedule… on a saved theme in the Themes tab. Times are Toronto time. If you publish something else while a campaign is running, that newer design is kept when the campaign ends. Changes go live within 15 minutes of their time, done by the shop's server so they happen even when nobody has the site open; the window shows when the scheduler last checked. Scheduled designs are now kept private instead of being downloaded by every shopper. This needs the updated Firestore rules and Cloud Functions to be deployed; until then the studio says the scheduler hasn't run. Tested with local checks only.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
