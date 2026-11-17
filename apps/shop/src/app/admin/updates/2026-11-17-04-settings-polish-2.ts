import type { AppUpdate } from "../appUpdates";

export default {
  id: "settings-polish-2",
  date: "2026-11-17",
  title: "Clearer buttons in Settings",
  summary: "Smaller buttons on Settings cards, such as Copy link, Check again and Fill in missing rates, are now soft rounded buttons instead of loose words. Your web address sits in its own tinted box with its buttons together, and the What you sell box no longer runs under its Save button. Shipping is unchanged.",
  links: [{ label: "General", tab: "settings", settingsTab: "general" }, { label: "Taxes", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
