import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-ledger-actions",
  date: "2026-11-11",
  title: "Tax centre: fix an expense in the ledger",
  summary: "In the Tax centre's ledger, an expense you logged now has a category picker and a Remove button. Move it to the right category in one tap, or take out one you logged by mistake (it asks first). Sales and costs logged on a product stay as they are.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
