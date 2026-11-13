import type { AppUpdate } from "../appUpdates";

export default {
  id: "payment-link-email",
  date: "2026-11-13",
  title: "Your shop emails payment links for you",
  summary: "On an order made with New order to pay, Send by email now sends the customer their payment link straight from your shop, with your note, the total and the day the link closes. You no longer need your own mail app. You can change the words in Settings › Email sender › Payment link.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Edit the email", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
