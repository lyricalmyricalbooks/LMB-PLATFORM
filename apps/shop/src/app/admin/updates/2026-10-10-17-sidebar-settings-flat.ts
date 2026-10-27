import type { AppUpdate } from "../appUpdates";

export default {
  id: "sidebar-settings-flat", date: "2026-10-10", title: "Settings pages in the main menu, smaller What's new",
  summary: "General, Shipping, Payments, Taxes, Design, Notifications and Email sender are now in the main sidebar list under a small Settings heading, each with its own icon, so one click opens them. The privacy-request count now shows on General, where those requests are handled. What's new is now a small button at the bottom of the sidebar showing the latest update's title, with a dot until you open it; clicking it opens all updates in a pop-up window. Long addresses in update notes now wrap instead of running off the edge.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
