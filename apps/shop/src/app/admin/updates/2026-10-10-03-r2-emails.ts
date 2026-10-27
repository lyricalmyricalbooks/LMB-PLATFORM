import type { AppUpdate } from "../appUpdates";

export default {
  id: "r2-emails", date: "2026-10-10", title: "Safer, clearer shop emails",
  summary: "The shop now has one shared hourly and daily limit for email that anyone on the internet can trigger (contact-form replies and notices, privacy requests, cancel/return requests, back-in-stock alerts and cart reminders), so a flood of made-up addresses can no longer use up your Gmail sending allowance. Contact-form senders must give one plain address, and the same address asking for its data twice in a day is mailed to you once. Cart reminders now go only to addresses that have a checkout attempt or a verified account (back-in-stock emails still go to anyone who signed up, within the shared limit), and reminders wait until a postal address is saved in Settings › General › Location (Overview › Ready to sell now flags it). E-book-only orders no longer say “we're preparing it for shipment”, and the “Fulfil this order”, “Open this order” and “Shop now” buttons are readable in the light email theme. These were checked with local tests only. To use them, deploy the Cloud Functions and the Firestore rules together with this release.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }, { label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
