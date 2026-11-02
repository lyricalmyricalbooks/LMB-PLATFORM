import type { AppUpdate } from "../appUpdates";

export default {
  id: "duties-note",
  date: "2026-11-02",
  title: "Warn buyers abroad about duties and import tax",
  summary: "In Settings › Taxes, a new Duties card adds a note to checkout for parcels leaving your country: the buyer's country may charge duties and import tax on arrival. You can also show a rough percentage estimate. It is only a note, so nothing is added to the total and you don't collect or pay these. The wording is editable in Studio.",
  links: [{ label: "Open tax settings", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
