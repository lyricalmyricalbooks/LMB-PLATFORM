import type { AppUpdate } from "../appUpdates";

export default {
  id: "french-invoices",
  date: "2026-11-03",
  title: "Your Colophon invoices in your language",
  summary: "Your Colophon invoices and receipts now use the same language as our emails. If you chose French, or your billing address is in Quebec and you didn't choose, they come in French. Otherwise they come in English. The plan's name on the invoice line still shows in English for now.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }],
} satisfies AppUpdate;
