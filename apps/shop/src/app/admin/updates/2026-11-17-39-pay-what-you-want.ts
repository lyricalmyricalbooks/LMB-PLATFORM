import type { AppUpdate } from "../appUpdates";

export default {
  id: "pay-what-you-want",
  date: "2026-11-17",
  title: "Pay what you want (Beta), and an alert when a buyer runs out of downloads",
  summary: "Open a product, and under Price turn on \"Buyers pay what they want\". The price you set becomes the lowest amount, and buyers type what they would like to pay on the product page, up to 1,000. Set the price to 0 to give something away and let buyers pay if they like. Checkout charges the amount the buyer chose and refuses anything lower than your price. It works for products without versions, and not for gift cards or box sets. Also new: when a buyer has used every download of a file, the Alerts page tells you, so you can open the order and reset their download limits. Still Beta, and not yet tried with a real payment.",
  links: [{ label: "Products", tab: "catalog" }, { label: "Orders", tab: "orders" }],
} satisfies AppUpdate;
