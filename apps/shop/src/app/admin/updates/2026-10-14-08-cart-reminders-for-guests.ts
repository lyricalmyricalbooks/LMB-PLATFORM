import type { AppUpdate } from "../appUpdates";

export default {
  id: "cart-reminders-for-guests",
  date: "2026-10-14",
  title: "Cart reminders reach guests who only typed their email",
  summary: "Before, a shopper who typed their email at checkout and left without pressing Pay never got a cart reminder; only shoppers who had pressed Pay or had a verified account did. Now anyone who types their email at checkout, and didn't decline marketing cookies, gets one reminder. Each email address still gets one reminder ever, no more than 25 go out a day, and every reminder has an unsubscribe link. This takes effect with the next Firebase deploy, which runs automatically when this change is merged.",
  links: [{ label: "Open Email sender settings", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
