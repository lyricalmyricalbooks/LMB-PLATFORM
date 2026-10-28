import type { AppUpdate } from "../appUpdates";

export default {
  id: "provincial-tax-presets",
  date: "2026-10-28",
  title: "Tax presets for e-books and provincial sales tax",
  summary: "Taxes › Start from a preset has two new choices. Canada: e-books charges full HST in the HST provinces, because only printed books get the HST give-back. It also charges GST plus QST in Quebec. Canada: other goods with provincial sales tax adds British Columbia and Saskatchewan PST, Manitoba RST and Quebec QST to GST. Each rate gets its name in your books, like GST + PST BC. The printed books preset now explains why printed books pay only GST. A preset only fills provinces that have no rate yet. Rates are as of October 2026, and this is not tax advice.",
  links: [{ label: "Open Taxes", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
