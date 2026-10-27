import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-design-polish",
  date: "2026-10-22",
  title: "A sharper, more even admin",
  summary:
    "Buttons are one height everywhere, every card's fold arrow sits on the right, and every list names its rows the same way: a bold underlined link with a grey line under it. The Ship station gets a figures strip and a tidier order toolbar with arrow buttons. Store status is a clean list of choices, the test sale walkthrough uses tick boxes, and empty pages show simple line icons instead of emoji.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
