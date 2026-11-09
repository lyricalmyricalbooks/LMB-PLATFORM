import type { AppUpdate } from "../appUpdates";

export default {
  id: "colophon-emails",
  date: "2026-11-09",
  title: "New emails from Colophon",
  summary: "Colophon now emails you when your move between Stripe and Square is done, and when Chit Chats stops accepting your details, with a reminder a week later if it still does. You can turn off the Chit Chats emails on its page in Settings › Apps.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
