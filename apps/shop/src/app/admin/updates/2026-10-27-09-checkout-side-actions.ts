import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-side-actions",
  date: "2026-10-27",
  title: "Order tracking and admin checks in their own files",
  summary: "Behind the scenes, order tracking, cancel and return requests, newsletter sign-ups, privacy requests, gift card changes and the Stripe connection checks now each live in their own file on the server instead of one very long one. Nothing you see changes; it makes each of them safer to fix without touching payments.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
