import type { AppUpdate } from "../appUpdates";

export default {
  id: "client-time-zone",
  date: "2026-11-18",
  title: "Video calls in the client's own time zone",
  summary: "When someone books a video call from another time zone, your booking page now shows the times on their own clock, with a link to switch to yours (Beta). Their emails and their booking page show both times, so nobody turns up an hour out.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
