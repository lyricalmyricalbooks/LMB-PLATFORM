import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-proof-tests",
  date: "2026-10-14",
  title: "Safety tests for who the shop may email",
  summary: "Behind the scenes, the rule that decides whether abandoned-cart reminders and back-in-stock alerts may be sent to an address (only people with a real checkout attempt or a verified account) now has its own automated tests, so a future change can't quietly let the shop email strangers. Nothing you or shoppers see has changed, and this is not a deployment.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
