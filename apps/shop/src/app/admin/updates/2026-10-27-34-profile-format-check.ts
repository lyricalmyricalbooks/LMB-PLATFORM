import type { AppUpdate } from "../appUpdates";

export default {
  id: "profile-format-check",
  date: "2026-10-27",
  title: "A check keeps the shop and stockroom reading the same settings",
  summary: "Maintenance only: a new automatic check fails any change that would make the shop and the stockroom read your shop's settings file differently, so both always connect to the same place.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
