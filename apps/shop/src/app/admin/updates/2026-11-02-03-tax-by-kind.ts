import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-by-kind",
  date: "2026-11-02",
  title: "Different tax for different kinds of product",
  summary: "In Settings, Taxes, a rate can now apply to one kind of product only (for example clothing at 0% where children's clothes are exempt). A bag that mixes kinds is taxed kind by kind, and checkout shows the same total the server charges. Rates you already have still apply to everything, so nothing changes until you add a kind-specific one.",
  links: [{ label: "Open Taxes", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
