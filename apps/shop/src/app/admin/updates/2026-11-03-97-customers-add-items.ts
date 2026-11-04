import type { AppUpdate } from "../appUpdates";

export default {
  id: "customers-add-items",
  date: "2026-11-03",
  title: "Customers can add to their own order",
  summary: "Until an order ships, your customer's order page has an Add something to this order box. They pick a product, pay for just that at your price, and it shows on the first order so you pack both in one parcel with no extra shipping. To turn it off, hide the box in Studio.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
