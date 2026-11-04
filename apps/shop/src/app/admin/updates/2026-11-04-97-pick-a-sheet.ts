import type { AppUpdate } from "../appUpdates";

export default {
  id: "pick-a-sheet",
  date: "2026-11-04",
  title: "Choose which sheet to bring in",
  summary: "When an Excel or LibreOffice file has several sheets, the shop reads the first one with anything in it and shows a Sheet choice beside the file name, so you can switch to another sheet without saving a new file. Hidden sheets stay out.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
