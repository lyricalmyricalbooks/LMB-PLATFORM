import type { AppUpdate } from "../appUpdates";

export default {
  id: "invoice-reminders",
  date: "2026-11-11",
  title: "Remind a stockist about an unpaid invoice",
  summary: "Open an owed invoice and press Remind to email a polite payment reminder. If they promised to pay by a date, save it there and you'll see it before you chase them.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
