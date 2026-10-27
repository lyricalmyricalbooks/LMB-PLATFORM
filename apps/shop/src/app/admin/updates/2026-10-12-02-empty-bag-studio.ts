import type { AppUpdate } from "../appUpdates";

export default {
  id: "empty-bag-studio",
  date: "2026-10-12",
  title: "The empty shopping bag is editable in Studio",
  summary:
    "When a shopper opens the bag with nothing in it, that screen can now be clicked in the Studio preview like the rest of the bag. In Studio › Theme settings › Cart drawer (shopping bag) › Empty bag you can hide the bag icon, hide the “Continue shopping” button, and choose where that button goes (a shop address such as /collections/new, or a full https:// link; blank keeps it going to Home). The words stay in Text & labels › Cart. Nothing changes on your shop until you change these.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
