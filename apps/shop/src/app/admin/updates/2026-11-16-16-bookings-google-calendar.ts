import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-google-calendar",
  date: "2026-11-16",
  title: "Bookings: straight into Google Calendar, with Google Meet links",
  summary: "Turn on Put bookings straight into Google Calendar under Bookings › Hours & rules, and each booking shows up at once in the calendar Connect Google made for your shop. Moves and cancellations follow. Mark a one-to-one service as a video call and every booking of it gets its own Google Meet link, in the customer's emails, on their booking page and on the booking here. It needs Calendar ticked in Settings › Google.",
  links: [{ label: "Bookings", tab: "bookings" }, { label: "Google", tab: "settings", settingsTab: "google" }],
} satisfies AppUpdate;
