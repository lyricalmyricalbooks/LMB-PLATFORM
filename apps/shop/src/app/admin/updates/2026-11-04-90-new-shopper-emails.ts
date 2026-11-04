import type { AppUpdate } from "../appUpdates";

export default {
  id: "new-shopper-emails",
  date: "2026-11-04",
  title: "More emails to your customers, and a safety email",
  summary: "Customers now get an email when they ask to return or cancel an order, so they know it reached you, and when a delayed bank payment doesn't go through. You can also send \"out for delivery\" and \"delivered\" emails for parcels sent with a carrier: that one is off until you turn it on. Edit or switch off each one in Settings, Notifications. And when someone turns two-step sign-in on or off, they and you get an email, so a change nobody made is spotted.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
