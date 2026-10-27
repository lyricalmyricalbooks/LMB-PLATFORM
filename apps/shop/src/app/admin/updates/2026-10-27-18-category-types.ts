import type { AppUpdate } from "../appUpdates";

export default {
  id: "category-types",
  date: "2026-10-27",
  title: "Category rules are now checked for mistakes",
  summary: "Behind the scenes, the shared rules that decide which books belong to a category (used by the shop menus, search and the category manager in Studio) now carry type descriptions, so the code checker can catch mistakes in them before they reach the shop. Known type problems dropped from 69 to 36. Nothing you see changes.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
