import type { AppUpdate } from "../appUpdates";

export default {
  id: "store-credit",
  date: "2026-11-13",
  title: "Give store credit from an order",
  summary: "Every paid order now has Give store credit. It opens the gift card form already filled in with the customer's name, email and the order total, so you can offer credit instead of a refund in a few clicks. The credit is a code they spend at checkout, and it's listed in Gift cards.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Gift cards", tab: "giftCards" }],
} satisfies AppUpdate;
