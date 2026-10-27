import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-cart-reminder-per-address",
  date: "2026-10-14",
  title: "Each shopper gets one cart reminder, ever",
  summary: "Abandoned-cart reminders now go to each email address only once. Before, someone who left a new cart more than three days after their last reminder could get another one. Now a second cart from the same address is skipped, including for people who were reminded before this change. The other limits stay as they were: one hour's wait, carts up to seven days old, at most 25 reminders a day, and you can still switch reminders off in Email sender. This takes effect with the next Firebase deploy, which runs automatically when this change is merged.",
  links: [{ label: "Open Email sender settings", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
