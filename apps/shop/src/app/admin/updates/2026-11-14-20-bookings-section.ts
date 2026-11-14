import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-section",
  date: "2026-11-14",
  title: "A \"Book a time\" section for any page",
  summary: "Studio has a new section, Book a time, that you can drop on your home page or any other page. It shows your services with their price and length, and a button on each that opens your booking page on that service. It only appears while you are taking bookings, so nothing looks broken when bookings are off.",
  links: [{ label: "Design", tab: "design" }, { label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
