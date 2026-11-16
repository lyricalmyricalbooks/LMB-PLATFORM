import type { AppUpdate } from "../appUpdates";

export default {
  id: "switch-to-services",
  date: "2026-11-16",
  title: "Switch your shop to services, or back",
  summary: "Once Bookings is on for your shop, Settings › General › What you sell lists services too. Pick one, such as Hair and beauty, and your menu becomes Calendar, Clients and Money. Pick a product answer to switch back. Your products, orders, bookings and clients stay where they are either way.",
  links: [{ label: "What you sell", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
