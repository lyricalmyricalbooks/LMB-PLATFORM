import type { AppUpdate } from "../appUpdates";

export default {
  id: "ship-part-now",
  date: "2026-11-03",
  title: "Ship part of an order now, the rest later",
  summary: "When one item is ready and another isn't, open the order and press Send part now, the rest later. Choose what goes in the parcel and enter its tracking number. The customer gets an email saying part of their order is on its way, and their order page lists each parcel with its own tracking link. The order stays open until you mark the rest shipped as usual. You can change the email's words under Notifications, Part Shipped.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
