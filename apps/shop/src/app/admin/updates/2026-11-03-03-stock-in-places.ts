import type { AppUpdate } from "../appUpdates";

export default {
  id: "stock-in-places",
  date: "2026-11-03",
  title: "Your stockroom can now track copies in more than one place",
  summary: "On a product's page in the stockroom there is a new Move between places button. Use it to note that some copies are at your studio and some at a market stall. The total on hand, your sales and your taxes do not change, and your website still sees only the total. A product with no places looks exactly as before.",
  links: [{ label: "Open the stockroom link", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
