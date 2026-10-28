import type { AppUpdate } from "../appUpdates";

export default {
  id: "accessibility-check",
  date: "2026-10-28",
  title: "Every theme is checked for people who use screen readers",
  summary: "Before any update reaches your shop, an automatic check now opens the home page, a book page and checkout under every theme and looks for problems that make the shop hard to use with a screen reader or hard to read. The header's bag button, the logo link and the Pay button now say the same words out loud that shoppers see, and the faint currency label and Admin link are easier to read. Problems a theme already had are listed, and an update can only make that list shorter.",
  links: [{ label: "Open Design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
