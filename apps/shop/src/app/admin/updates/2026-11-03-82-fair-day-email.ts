import type { AppUpdate } from "../appUpdates";

export default {
  id: "fair-day-email",
  date: "2026-11-03",
  title: "An evening email after a fair day",
  summary: "If you have both the website and the stockroom, on any day the Fair till sells something you now get an email at 9pm with the day's takings, how people paid and what sold, so you can check the card reader's total without opening the admin. You can switch it off, or send it to yourself straight away, in Settings › Email sender › Shop alerts.",
  links: [{ label: "Open Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
