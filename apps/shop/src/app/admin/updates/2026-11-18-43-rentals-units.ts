import type { AppUpdate } from "../appUpdates";

export default {
  id: "rentals-units",
  date: "2026-11-18",
  title: "Rental units out for repair, written off or sold (Beta)",
  summary: "Each rental item now has a Units button. Take a unit out for repair, bring it back, or mark it written off or sold. Rentals still to come on that unit move to another free unit by themselves. If none is free, you see who is booked and choose: leave the unit as it is, or cancel and refund them. Rooms and spaces rent by the hour the same way as anything else, with cleaning time between bookings.",
  links: [{ label: "Rentals", tab: "rentals" }],
} satisfies AppUpdate;
