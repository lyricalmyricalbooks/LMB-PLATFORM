import type { AppUpdate } from "../appUpdates";

export default {
  id: "phone-tabs-readable-text",
  date: "2026-10-14",
  title: "Phone menu tabs and bigger phone text",
  summary: "On phones the shop's categories and pages now sit in a row of tabs across the top (swipe sideways for more) instead of a drop-down Menu; a category with sub-categories (like PUBLICATIONS › Books, zines) opens its own drop-down, the same as on the desktop header. To switch back, open Studio › Theme settings › Header & announcement bar › Phone navigation style; Phone tab text size sets how big the tabs are. Small labels, book titles and prices on phones now never shrink below 12 px, so card titles are readable again. Change it in Studio › Theme settings › Small print & labels › Smallest text on phones (0 turns it off).",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
