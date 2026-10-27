import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-sender-one-page", date: "2026-10-10", title: "Notifications and Email sender are one page",
  summary: "Notifications and Email sender opened the same page, so they are now a single menu item called Email sender. It holds everything about the emails your shop sends: the email templates, emails to the shop, Gmail sending, the sender name and reply-to address, and recent deliveries. Old links and shortcuts to either page open it, and messages elsewhere in the admin now point to Settings › Email sender.",
  links: [{ label: "Open Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
