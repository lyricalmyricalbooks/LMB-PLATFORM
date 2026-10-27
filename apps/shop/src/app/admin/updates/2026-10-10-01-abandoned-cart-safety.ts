import type { AppUpdate } from "../appUpdates";

export default {
  id: "abandoned-cart-safety", date: "2026-10-10", title: "Abandoned-cart reminders can't be misused",
  summary: "Anyone can type any email address at checkout, so the cart reminder now uses only a plain first name from what the shopper typed (otherwise it says “Hi there”) and never their other words. The shop also sends at most 25 reminders a day; any extra wait for the next day. Real shoppers still get their reminder as before. Needs the updated Cloud Functions deployed.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
