import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-link-older-orders", date: "2026-10-11", title: "Inventory app link: send older website orders",
  summary: "The start date for sending website sales to the inventory app can now move earlier. Use Inventory › Inventory app link › step 3 › Send older orders too, and choose a day such as 1 January 2025. Every paid website order from then on is sent once, and the inventory app shows its summary and waits for you to press Bring them in, so sales you already typed in by hand are linked instead of counted twice. Website stock waits until the older orders have all been sent. The date can't move later, because orders already sent can't be taken back.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
