import type { AppUpdate } from "../appUpdates";

export default {
  id: "french-emails-everywhere",
  date: "2026-11-04",
  title: "More French emails, and a French tag on orders",
  summary: "When your shop is in French, the welcome, message-received and cart reminder emails go out in French too. Send test on the French tab sends the French version. Orders placed in French carry an FR tag, so you know to reply in French.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
