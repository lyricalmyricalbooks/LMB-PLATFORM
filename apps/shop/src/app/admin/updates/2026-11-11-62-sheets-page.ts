import type { AppUpdate } from "../appUpdates";

export default {
  id: "sheets-page",
  date: "2026-11-11",
  title: "Your Google Sheet now lives in the admin",
  summary: "Stockroom › Sheets is drawn by the admin itself instead of the old inventory app. One card shows your Google Sheet, when it was last sent and what it holds, with Send now and Open sheet by the title. Copy sales to sheet sends it again by itself when you open the page and it is more than six hours old. Settings › Google now points to this page, so the sheet is made and sent from one place.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
