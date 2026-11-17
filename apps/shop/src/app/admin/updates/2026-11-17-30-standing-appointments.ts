import type { AppUpdate } from "../appUpdates";

export default {
  id: "standing-appointments",
  date: "2026-11-17",
  title: "Standing appointments (Beta)",
  summary: "Clients can now book the same time every few weeks in one go, for example every 5 weeks, 6 times. Turn it on for a one-to-one service under Bookings, Services, Clients can book a standing appointment. It works for services that are free or paid at the visit with no card kept on file. You can set one up for any one-to-one service yourself: New booking or Book again has a Repeat choice that checks every date first. Each visit is its own booking with its own reminder and can be moved alone, and cancelling can take the later visits too. This has not been tried on a live shop yet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
