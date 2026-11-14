import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-test-fixes",
  date: "2026-11-14",
  title: "Bookings: smoother card payments and clearer screens",
  summary: "If card payments aren't ready yet, customers get a plain message instead of a vague error. Add a service from the empty calendar opens the form straight away, the figures say which week they count, and your bookings page names its time zone in everyday words. Cancelling a paid booking now refunds it properly. Also: the Payments page says you are ready for test payments while test mode is on, and your website footer no longer shows Toronto until you type your own town in Studio.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
