import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-profile",
  date: "2026-10-27",
  title: "The shop now reads its own settings when a page opens",
  summary: "Behind the scenes, the shop's connection settings (which database it uses, where its server lives and its bot-protection key) now come from one small settings file the page reads as it opens, instead of being written into the shop's code. Your shop looks and works the same: the file holds today's values. This is the first step toward running other presses' shops from the same code, each with its own file.",
  links: [{ label: "Open settings", tab: "settings" }],
} satisfies AppUpdate;
