import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-stock-in-admin",
  date: "2026-11-11",
  title: "Stock and sales is now part of your admin",
  summary: "Stockroom › Stock and sales no longer opens a second app inside a frame. Your admin reads the stockroom's records itself and shows every item's copies on hand, what sold where, what is out at stores and what was written off, with sold-out and running-low items first. It is read-only for now; the numbers come from the stockroom's own rules.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
