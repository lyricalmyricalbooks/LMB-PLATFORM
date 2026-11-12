import type { AppUpdate } from "../appUpdates";

export default {
  id: "bills-in-your-currency",
  date: "2026-11-12",
  title: "Colophon bills in your own currency, with your local tax",
  summary: "Shops in the United States are billed in US dollars and shops in Canada in Canadian dollars. The tax on each monthly bill follows your billing address: your province in Canada, or your state in the US. Settings › Billing › Billing details now asks for the country, and a state and ZIP code for a US address.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
