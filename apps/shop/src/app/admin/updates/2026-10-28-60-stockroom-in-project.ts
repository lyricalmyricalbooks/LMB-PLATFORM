import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-in-project",
  date: "2026-10-28",
  title: "Your stockroom links to your shop with nothing to set up",
  summary: "The stockroom now lives inside your shop, so the Inventory app link no longer asks you to grant access anywhere: press Check connection once and it connects. The Website · Inventory switch opens your own stockroom. If your shop doesn't include the stockroom yet, the link says so plainly instead of showing setup steps.",
  links: [{ label: "Open the Inventory app link", tab: "inventory" }],
} satisfies AppUpdate;
