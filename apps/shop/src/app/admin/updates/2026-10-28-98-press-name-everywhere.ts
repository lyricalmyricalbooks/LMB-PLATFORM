import type { AppUpdate } from "../appUpdates";

export default {
  id: "press-name-everywhere",
  date: "2026-10-28",
  title: "Your shop's name in every email and in your Google feed",
  summary: "Newsletter sign-up emails, your replies to messages, customs forms on international labels, the Monday report and its PDF, gift cards you issue and your Google Shopping feed now all use the Site name you typed in Text & labels. Before, some of them still said \"Your Press\" when the Store name in General settings had never been changed. If you set a Sender name for emails, that name is still used for them.",
  links: [
    { label: "Open Email settings", tab: "settings", settingsTab: "notifications" },
    { label: "Open General settings", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
