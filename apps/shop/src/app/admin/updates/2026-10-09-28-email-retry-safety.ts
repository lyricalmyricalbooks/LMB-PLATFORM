import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-retry-safety", date: "2026-10-09", title: "Safer email retries",
  summary: "Follow-up to automatic email retries. A waiting email is checked again before it goes out, so customers no longer get an order confirmation after a refund or cancellation, or a gift-card code after the card was disabled. A retry that already went through can't be sent a second time, and Stop won't claim to stop an email that is being sent at that moment. Retries are limited in time so they can't hold up the 15-minute payment check. A gift card sent by a retry now shows as emailed in Gift cards. Privacy export and erase now include waiting emails and delivery records for that address. In Notifications, Needs attention drops emails a retry later delivered, the order table can only be added to the body, and the Ready to sell strip counts an email waiting to retry as not sent. Deploy the updated Cloud Functions for the server parts.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
