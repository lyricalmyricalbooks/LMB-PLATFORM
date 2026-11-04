import type { AppUpdate } from "../appUpdates";

export default {
  id: "xls-files",
  date: "2026-11-04",
  title: "Older Excel files come straight in",
  summary: "Excel files from before 2007 (.xls) now open in every window that brings a file in, just like newer ones, so there is no need to save them again first. A file protected with a password gets the steps to remove it.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
