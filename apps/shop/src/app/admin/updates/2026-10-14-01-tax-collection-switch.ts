import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-collection-switch",
  date: "2026-10-14",
  title: "Switch sales tax off with one control",
  summary: "Settings › Taxes now has a Collect sales tax at checkout switch. Turn it off and Save, and checkout charges no tax on any order, however many rates are listed. Your rates stay saved, so turning the switch back on brings them straight back. The checkout server needs this update deployed before the switch takes effect on charges.",
  links: [{ label: "Open Taxes", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
