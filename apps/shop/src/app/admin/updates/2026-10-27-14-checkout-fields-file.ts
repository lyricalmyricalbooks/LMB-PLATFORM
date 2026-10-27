import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-fields-file",
  date: "2026-10-27",
  title: "Checkout's form fields have their own file",
  summary: "Behind the scenes, the boxes shoppers fill in at checkout (name and address boxes, the province list, address suggestions while typing and the messages under a box that needs fixing) moved into a file of their own. Checkout looks and works exactly as before.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
