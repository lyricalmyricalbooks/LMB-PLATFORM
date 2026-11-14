import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-test-fixes",
  date: "2026-11-14",
  title: "Bookings: smoother card payments and clearer screens",
  summary: "Paid bookings now take cards only, so a slow bank payment can no longer outlast the time held for your customer. If card payments aren't ready yet, customers get a plain message instead of a vague error. Add a service from the empty calendar opens the form straight away, the figures say which week they count, and your bookings page names its time zone in everyday words.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
