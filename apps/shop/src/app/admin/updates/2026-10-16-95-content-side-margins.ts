import type { AppUpdate } from "../appUpdates";

export default {
  id: "content-side-margins",
  date: "2026-10-16",
  title: "Content width can follow the screen size",
  summary: "Theme settings › Layout & spacing › How the content width is set now offers Side margins: instead of a fixed pixel width, you choose the space on each side as a share of the screen (default 5%), so the header, shop grid, book pages, custom pages and footer keep the same proportions on a laptop and a large monitor. Fixed width still works as before. Custom pages also now follow Content widths above 1600px.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
