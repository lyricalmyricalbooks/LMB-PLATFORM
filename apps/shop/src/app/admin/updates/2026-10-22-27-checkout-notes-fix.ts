import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-notes-fix",
  date: "2026-10-22",
  title: "Checkout notes corrected",
  summary:
    "A maintenance-only change: the developer notes now describe how the checkout's payment tabs are built. Nothing in the shop or the admin changes.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
