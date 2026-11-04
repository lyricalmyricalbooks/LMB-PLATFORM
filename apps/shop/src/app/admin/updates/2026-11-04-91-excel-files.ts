import type { AppUpdate } from "../appUpdates";

export default {
  id: "excel-files",
  date: "2026-11-04",
  title: "Bring Excel files straight in",
  summary: "Every window that brings a file in now takes Excel files (.xlsx), LibreOffice and Google Sheets downloads (.ods), and CSV or tab-separated text, so there is no need to save as CSV first. Your column names still fill in the right fields, and Excel dates come over as dates. Books › Import CSV is now called Import spreadsheet. An older Excel file (.xls) or a Numbers file gets the exact steps to save it in a form the shop can read.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
