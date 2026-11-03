import type { AppUpdate } from "../appUpdates";

export default {
  id: "discount-bag-order",
  date: "2026-11-03",
  title: "Percentage discounts round the same way every time",
  summary: "A percentage discount that landed exactly on half a cent could round up or down depending on the order of the books in the bag. It now always comes out the same, at checkout and on the bag.",
  links: [{ label: "Open Discounts", tab: "discounts" }],
} satisfies AppUpdate;
