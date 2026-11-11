import type { AppUpdate } from "../appUpdates";

export default {
  id: "labels-from-shipping",
  date: "2026-11-11",
  title: "Buy a label right from Shipping",
  summary: "On the stockroom's Shipping page, a website order still waiting to go out now has a Buy label button. It opens the same parcel and rate picker as the order's own page, asks you to confirm the price before anything is charged, and the order leaves the waiting list once the label is bought. An order whose address isn't checked or isn't packed yet sends you to its page first, and an order that already has a label is never offered a second one.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
