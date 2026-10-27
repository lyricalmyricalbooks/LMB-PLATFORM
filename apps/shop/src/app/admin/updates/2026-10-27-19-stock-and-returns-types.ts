import type { AppUpdate } from "../appUpdates";

export default {
  id: "stock-and-returns-types",
  date: "2026-10-27",
  title: "Stock changes are checked more strictly",
  summary: "Behind the scenes, the code checker now knows that a stock change either saved a new count or explains why it didn't, so a mistake in the Inventory screen's undo or bulk-change code would be caught before it reaches you. The return form, edition picks, review badges and book page links got the same kind of check. Known type problems dropped from 36 to 24. Nothing you see changes.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
