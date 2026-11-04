import type { AppUpdate } from "../appUpdates";

export default {
  id: "moving-check-refunds",
  date: "2026-11-03",
  title: "Refunded and cancelled orders checked on every change",
  summary: "Behind the scenes: the automatic check that walks through a whole move from an old shop now brings over a refunded order, a partly refunded one and a cancelled one, so bringing real order files with refunds and cancellations keeps working as the shop changes. Nothing changes on your screens.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
