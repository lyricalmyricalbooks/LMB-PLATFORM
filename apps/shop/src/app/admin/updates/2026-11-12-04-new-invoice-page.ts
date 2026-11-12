import type { AppUpdate } from "../appUpdates";

export default {
  id: "new-invoice-page",
  date: "2026-11-12",
  title: "New invoice and stockist terms are their own pages",
  summary: "New invoice opens a full page laid out like the new design: who it's for, the items, then the note and sending, with the total adding up beside it and quick buttons for due in 7, 14 or 30 days. Adding or editing a stockist works the same way, with quick buttons for your share and how often you settle, and a green box showing what you keep of a sale.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
