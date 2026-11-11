import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-sales-customers-in-admin",
  date: "2026-11-11",
  title: "Sales records and Customers are now part of your admin",
  summary: "Stockroom › Sales records and Customers no longer open a second app inside a frame. Your admin reads the stockroom's records itself: search every sale, filter by channel, date or item, see voided sales marked and left out of the totals, and open a sale or a buyer for the full story. These two pages show what is recorded; changing or voiding a sale comes in a later step.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
