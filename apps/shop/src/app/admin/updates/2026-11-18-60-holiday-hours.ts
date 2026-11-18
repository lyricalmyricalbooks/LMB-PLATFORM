import type { AppUpdate } from "../appUpdates";

export default {
  id: "holiday-hours",
  date: "2026-11-18",
  title: "Holiday hours for a few dates",
  summary: "Set different opening hours for a stretch of dates (Beta), like shorter hours in December, a Sunday you open, or a closed Christmas Day. Add them under Bookings › Hours & rules › Holiday hours. They replace your weekly hours on those days for online booking and pickup times, and the calendar shows them. Each person on your team can have their own holiday hours too, in their details under Team & rooms. You can still book someone in outside them yourself.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
