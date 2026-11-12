import type { AppUpdate } from "../appUpdates";

export default {
  id: "app-store-open",
  date: "2026-11-12",
  title: "The app store opens in every shop",
  summary: "Settings › Apps now shows the app store and the apps you've added, not just past app activity. From there you can add Chit Chats, Mailchimp and Zapier as each one goes live.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
