import type { AppUpdate } from "../appUpdates";

export default {
  id: "us-shop-time-zone",
  date: "2026-11-13",
  title: "Your shop's day follows your own time zone",
  summary: "Sale dates, release dates, the last day of a discount code and the daily numbers on Home used to follow Eastern time for every shop. A new shop now takes the time zone of the computer it was signed up from, so a shop on the West Coast no longer ends a sale three hours early. Shops already open stay on Eastern time. The morning order email, the Monday report and the fair-day summary now arrive at your own morning too. An American shop's quick pickup now starts from your own city and state instead of Toronto.",
  links: [{ label: "Open Home", tab: "overview" }, { label: "Open Discounts", tab: "discounts" }],
} satisfies AppUpdate;
