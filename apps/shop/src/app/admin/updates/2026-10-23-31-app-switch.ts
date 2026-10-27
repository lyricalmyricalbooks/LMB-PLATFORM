import type { AppUpdate } from "../appUpdates";

export default {
  id: "app-switch",
  date: "2026-10-23",
  title: "Jump between the website and the inventory app",
  summary: "The top of the side menu now reads Website · Inventory. Press Inventory to open the inventory app; if it's already open in another tab, that tab comes forward where you left it. The number beside it counts website orders still waiting for the inventory app. On a phone, use the Inventory button in the top bar. Orders the website has sent to the inventory app also have See it in the inventory app, which opens that sale there. Only you see this.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Inventory app link", tab: "inventory" }],
} satisfies AppUpdate;
