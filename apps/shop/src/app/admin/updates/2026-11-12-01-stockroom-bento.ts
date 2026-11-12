import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-bento-tidy",
  date: "2026-11-12",
  title: "Tidier till and invoices",
  summary: "The till's morning summary now sits in its own mint tile, and the Letterhead button sits with the other invoice buttons.",
  links: [{ label: "Open the till", tab: "stockroom/pos" }, { label: "Open Invoices", tab: "stockroom/invoices" }],
} satisfies AppUpdate;
