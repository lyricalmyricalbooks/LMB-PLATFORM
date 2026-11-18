import type { AppUpdate } from "../appUpdates";

export default {
  id: "sold-by-amount",
  date: "2026-11-18",
  title: "Sell fabric by the metre and beads by weight",
  summary: "Fabric now starts sold by the metre and beads by weight. You pick the step (10 cm, 10 g) and the smallest amount, and enter the price and stock for each step. Shoppers see the price per metre or per 100 g, choose how much they want on the product page, and the bag, checkout, order, packing slip and emails all show the amount, such as 1.5 m. Checkout refuses anything under your smallest amount. Turn it on or off in the product's Price card.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
