import type { AppUpdate } from "../appUpdates";

export default {
  id: "auto-reminders",
  date: "2026-11-11",
  title: "Late invoices get a reminder by themselves",
  summary: "Turn on Invoices › Reminders and a stockist whose invoice is late gets one polite email, on a weekday during working hours, while your admin is open. You choose how many days after the due date it goes, and its words. The invoice shows that it went.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
