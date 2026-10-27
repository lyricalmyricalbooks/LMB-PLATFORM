import type { AppUpdate } from "../appUpdates";

export default {
  id: "settings-masthead-look",
  date: "2026-10-22",
  title: "Settings, sharpened",
  summary: "Every Settings page (General, Payments, Taxes, Email sender, the shipping setup tabs) now reads like the Overview: flat ruled sections instead of shadowed boxes, one short line under each heading instead of a paragraph, no line under the sub tabs, quiet flat buttons, and setup steps folded behind one underlined toggle. Nothing about how the settings work has changed.",
  links: [{ label: "General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
