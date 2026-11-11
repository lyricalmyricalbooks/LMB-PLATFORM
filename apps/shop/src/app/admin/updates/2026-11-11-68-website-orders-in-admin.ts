import type { AppUpdate } from "../appUpdates";

export default {
  id: "website-orders-in-admin",
  date: "2026-11-11",
  title: "Website orders reach your stockroom from the admin",
  summary: "While your admin is open, each paid website order becomes a sale in your stockroom by itself, and a refund puts the copies back. Your stock count goes back to the website after every change. A sale you already typed in by hand is linked rather than counted twice. If an order looks like one already in your books, it waits under Stock and sales › Website orders until you choose.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
