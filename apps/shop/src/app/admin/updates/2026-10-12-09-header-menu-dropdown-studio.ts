import type { AppUpdate } from "../appUpdates";

export default {
  id: "header-menu-dropdown-studio",
  date: "2026-10-12",
  title: "Studio: style the header menu's drop-downs",
  summary:
    "Header menu links with sub-links open a drop-down (or a mega menu with columns). Its background, link colour, border colour and corners can now be set in Settings › Design › Theme settings › Navigation links › Drop-down menus, and clicking an open drop-down in the preview opens those controls. Nothing changes on the live site until you set one.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
