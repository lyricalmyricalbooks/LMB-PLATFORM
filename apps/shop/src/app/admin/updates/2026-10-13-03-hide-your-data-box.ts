import type { AppUpdate } from "../appUpdates";

export default {
  id: "hide-your-data-box",
  date: "2026-10-13",
  title: "Order tracking: the “Your data” box is now off",
  summary: "The “Your data” box (Send me a copy / Delete my data) no longer shows under the order lookup on the order tracking page. To bring it back, open Studio › Theme settings › Customer accounts and turn on “Show the ‘Your data’ box on the order tracking page”. Privacy requests that already arrived stay in Settings › General › Privacy requests.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
