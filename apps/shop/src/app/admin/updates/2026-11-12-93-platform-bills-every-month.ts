import type { AppUpdate } from "../appUpdates";

export default {
  id: "platform-bills-every-month",
  date: "2026-11-12",
  title: "Every Colophon bill, with the month it covers and a PDF",
  summary: "Settings › Billing › Bills now shows which days each bill pays for, and a Show older bills button reaches every bill you were ever sent, including ones from an earlier plan. Each bill has Download PDF for your books.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
