import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-newest-orders-phone",
  date: "2026-10-22",
  title: "Newest orders on the Overview read cleanly on a phone",
  summary:
    "In the Newest orders panel on the Overview, each order's amount and status now sit on their own line under the order when the panel is narrow (on a phone, or in a half-width panel on a computer). The customer's name and the order line keep their full width instead of breaking a word or two per line. Which orders are listed and where their links go are unchanged.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
