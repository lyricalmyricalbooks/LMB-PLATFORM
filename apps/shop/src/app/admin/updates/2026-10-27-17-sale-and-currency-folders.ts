import type { AppUpdate } from "../appUpdates";

export default {
  id: "sale-and-currency-folders",
  date: "2026-10-27",
  title: "Sale end line and footer currency picker have their own folders",
  summary: "Behind the scenes, the \"Sale ends\" line on book pages (with its countdown) and the currency picker in the footer each moved into a folder that keeps their code, words and Studio controls together. Every switch, word and colour in Studio stays where it was, and the shop looks the same.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
