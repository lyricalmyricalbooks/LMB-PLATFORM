import type { AppUpdate } from "../appUpdates";

export default {
  id: "french-emails-everywhere",
  date: "2026-11-04",
  title: "More French emails, and a French tag on orders",
  summary: "When your shop is in French, the welcome email, the \"we got your message\" reply and the cart reminder now go out in French too. You can edit their French words on the French tab in Settings, Notifications. Send test on the French tab sends the French version. Orders placed in French show a French tag, so you know to reply in French. If you change an email's English words but not its French ones, a note reminds you to check the French tab.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
