import type { AppUpdate } from "../appUpdates";

export default {
  id: "payment-links",
  date: "2026-11-03",
  title: "Make an order for a customer and send them a link to pay",
  summary: "Orders › New order to pay builds an order for someone who asked by phone, email or at a fair: pick the products, set your own price for each (or keep the shop's), add a shipping charge or nothing to ship, and choose how long the link stays open. The order page then lets you copy the link or email it from your own mail app. The customer opens their order, sees what you agreed, and presses Pay now to pay by card on your usual payment page. Tax is added as at checkout and no discount codes apply on top. Cancelling the order closes its link.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
