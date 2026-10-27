import type { AppUpdate } from "../appUpdates";

export default {
  id: "unstyled-after-deploy", date: "2026-10-10", title: "No more unstyled shop page right after an update",
  summary: "Right after the website was updated, a visitor whose browser still had the previous version of a page could see it without any styling: plain white text, every menu shown at once and the header buttons stacked on the left. That happened because each update removed the previous version's style and script files. Each update now keeps the previous version's files as well, so an older copy of a page still loads its styles. If a style or script file is still missing, the page reloads itself once to get the current version. The update process change takes effect from the next deploy, and the first deploy after it can only keep files from deploys made with it, so a page cached from earlier may still need one manual refresh.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
