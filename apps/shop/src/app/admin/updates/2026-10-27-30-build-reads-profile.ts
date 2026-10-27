import type { AppUpdate } from "../appUpdates";

export default {
  id: "build-reads-profile",
  date: "2026-10-27",
  title: "Publishing reads the same shop settings file as the pages",
  summary: "Behind the scenes, the steps that build your sitemap, Google Shopping feed and saved catalog file now read which database and web address to use from the shop's settings file, the same one the pages read. Before, they looked inside the shop's code and stopped with an error once those values moved out. Your shop looks and works the same.",
  links: [{ label: "Open settings", tab: "settings" }],
} satisfies AppUpdate;
