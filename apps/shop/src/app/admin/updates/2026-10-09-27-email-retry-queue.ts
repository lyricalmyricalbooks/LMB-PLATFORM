import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-retry-queue", date: "2026-10-09", title: "Order emails are retried instead of lost",
  summary: "When Gmail and the backup sender both refuse an important email (order confirmations, shipping and refund notices, gift cards, new-order alerts), the shop now keeps it and tries again automatically — after 15 minutes, then longer gaps, for about a day. Settings › Notifications shows a Waiting to send list with Retry now and Stop, and Recent deliveries has a Needs attention filter. The Awaiting Payment email can be edited again (it was missing from the Orders tabs), Send test now uses your unsaved edits, placeholder buttons insert where your cursor is, spelling mistakes in placeholders are flagged, and each email has Reset to default. Emails with a malformed address or line breaks in the address are refused, and delivery records older than 90 days are deleted. This works once the updated Cloud Functions and Firestore rules are deployed.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
