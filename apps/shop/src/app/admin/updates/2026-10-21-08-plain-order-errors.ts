import type { AppUpdate } from "../appUpdates";

export default {
  id: "plain-order-errors",
  date: "2026-10-21",
  title: "Clearer messages when an order or discount action fails",
  summary: "Refunds, cancelling an unpaid order, buying a label, saving a note, correcting an address, batch order updates and saving a discount now say what failed and what to do next, instead of showing provider error text. Nothing about how these actions work changed.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
