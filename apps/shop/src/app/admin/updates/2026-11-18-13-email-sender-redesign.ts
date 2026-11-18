import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-sender-redesign",
  date: "2026-11-18",
  title: "A clearer Email sender page",
  summary: "Settings › Email sender has a new look in three tabs. Emails shows every email in a list beside the editor and a live preview, with a switch to send each one automatically and a phone view. Sending setup shows how sending is going, where your emails come from and exactly what shoppers see in their inbox. Deliveries shows today's sends, any problems in plain words (like a full mailbox or an address that doesn't exist) and lets you retry or open the customer.",
  links: [{ label: "Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
