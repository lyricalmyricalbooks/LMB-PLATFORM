import type { AppUpdate } from "../appUpdates";

export default {
  id: "bento-invoices",
  date: "2026-11-12",
  title: "Invoices and bills in the Colophon look",
  summary: "Your printed invoices and line sheets now have the Colophon look: a cream top with your name, round tiles for the details, and the amount due on the mint tile. Your monthly Colophon bills can now be printed or saved in the same look from Billing, with every line, each tax by name and both tax numbers; Stripe's own PDF stays beside it. Every amount and tax line is unchanged.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
