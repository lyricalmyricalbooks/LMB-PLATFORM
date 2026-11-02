import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-phone-check",
  date: "2026-11-02",
  title: "The admin is now checked on a phone-sized screen",
  summary: "Every time the shop is updated, thirteen of the busiest admin pages (orders, one order, customers, inventory, books, discounts, gift cards, reviews, messages and three settings pages) are opened at phone width in a real browser. If one starts scrolling sideways or breaks, the update is stopped before it reaches you. Nothing changes on screen today; this keeps the phone view working.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
