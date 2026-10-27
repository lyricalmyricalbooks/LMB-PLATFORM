import type { AppUpdate } from "../appUpdates";

export default {
  id: "art-book-search-words",
  date: "2026-10-18",
  title: "Search listings now mention photobooks and artists' books too",
  summary: "The shop's search descriptions already said \"photography and art books\". They now also say \"photobooks\" and \"artists' books\", added alongside the existing wording rather than replacing it: in the home page's built-in description, the Books and Publications intros, and the description Google sees for each collection page. The home page also tells Google what the shop publishes (art books, photography books, photobooks, artists' books, zines); edit that list in Studio › Text & labels › Site & sharing › What the shop publishes. Your own home page description in Settings › General is unchanged, so add the same words there if you want them in the home page's Google snippet. Google picks the new wording up the next time it visits each page.",
  links: [{ label: "Open Settings › General", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
