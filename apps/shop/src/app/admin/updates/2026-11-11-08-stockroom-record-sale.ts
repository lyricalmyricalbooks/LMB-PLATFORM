import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-record-sale",
  date: "2026-11-11",
  title: "Record a sale and void one, right in Sales records",
  summary: "Stockroom › Sales records now has a Record a sale button: pick the item, how many, the price, where it sold and the day, and it is saved with your copies on hand, money taken and channel totals worked out by the stockroom's own rules. Open a sale to void it; a voided sale stays on record, marked, and leaves every total. If another device saved at the same moment, both are kept and you are told. If the connection drops, the page says so and lets you try again.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
