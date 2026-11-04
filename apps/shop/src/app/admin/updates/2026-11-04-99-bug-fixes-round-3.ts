import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-fixes-round-3",
  date: "2026-11-04",
  title: "Fixes for Google, spreadsheets, refunds and French emails",
  summary: "When Google asks you to sign in again, your Overview now says so instead of showing it as connected. A 15% cell in an Excel file comes in as 15%, not 0.15%. Excel downloads no longer show a stray apostrophe. A refund your card company refuses no longer leaves the order stuck. French emails to shoppers with no name now read properly.",
  links: [{ label: "Open Google settings", tab: "settings", settingsTab: "google" }, { label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
