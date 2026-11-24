import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-hooks",
  date: "2026-11-24",
  title: "Send bookings to other apps",
  summary: "Bookings › Hours & rules now has Send bookings to other apps (Beta). Paste a web address from another app, such as a spreadsheet, a mailing list or an automation service, and pick what to send. Each new, moved or cancelled booking then goes there by itself. Send a test to check it works. If the other app doesn't answer, it's tried again over the next day, and you see what went wrong.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
