import type { AppUpdate } from "../appUpdates";

export default {
  id: "equipment-counts",
  date: "2026-11-18",
  title: "Rooms and equipment that take several bookings at once",
  summary: "A room or machine can now take more than one booking at the same time (Beta), like three massage tables in one room or two kilns. Under Bookings › Team & rooms › Rooms and equipment, pick how many it takes at once. It is full only when every one is in use, and each person still takes one booking at a time.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
