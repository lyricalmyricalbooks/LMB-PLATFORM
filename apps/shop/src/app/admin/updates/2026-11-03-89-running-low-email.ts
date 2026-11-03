import type { AppUpdate } from "../appUpdates";

export default {
  id: "running-low-email",
  date: "2026-11-03",
  title: "An email when something is running low",
  summary: "Your 8am email now tells you when a product reaches your low-stock line, so you can reorder or reprint before it sells out. Each item is mentioned once, and once more if it sells out; after you restock it, the next dip is reported again. Digital editions, box sets and gift cards are left out. It comes even on days with no orders to chase, and you can switch it off under Notifications, Shop alerts.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
