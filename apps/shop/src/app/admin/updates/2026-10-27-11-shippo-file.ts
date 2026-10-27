import type { AppUpdate } from "../appUpdates";

export default {
  id: "shippo-file",
  date: "2026-10-27",
  title: "Shippo has its own file on the server",
  summary: "Behind the scenes, the server's Shippo screens and requests (your connection settings, the carrier rates shoppers see at checkout, the address check and finder, and tracking updates) moved into a file of their own. Shipping works exactly as before.",
  links: [{ label: "Open shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
