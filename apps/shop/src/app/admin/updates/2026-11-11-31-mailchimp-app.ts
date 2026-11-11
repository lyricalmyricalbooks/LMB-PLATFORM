import type { AppUpdate } from "../appUpdates";

export default {
  id: "mailchimp-app",
  date: "2026-11-11",
  title: "Mailchimp app, ready to switch on",
  summary: "Colophon now has its own Mailchimp app. Once it appears in Settings › Apps, connect your Mailchimp account and pick an audience. People who confirm your newsletter are added every 15 minutes, buyers on your list are tagged with what they bought, and an unsubscribe in either place counts in both. Only people who said yes to your newsletter are ever sent.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
