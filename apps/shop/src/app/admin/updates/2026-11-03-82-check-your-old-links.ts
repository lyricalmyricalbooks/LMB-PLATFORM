import type { AppUpdate } from "../appUpdates";

export default {
  id: "check-your-old-links",
  date: "2026-11-03",
  title: "Check your old shop's links before you move",
  summary: "Settings › General › URL redirects now has Check your old links. Type your old shop's address and every page it lists is tried in your new shop. Any that would show “page not found” gets a suggested new home, which you can add one by one or all at once. Presses moving from another online shop also get a last step in Set up your shop: a short list for the day you move.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
