import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-links-address", date: "2026-10-10", title: "Email links point at the shop's new address",
  summary: "After the repository rename, buttons and links in emails (order tracking, Fulfil this order, newsletter confirm and unsubscribe, cart reminders, back-in-stock and review requests) still went to the old …/LyricalmyricalWebsiteTrial/ address, which no longer opens the shop. They now use lyricalmyricalbooks.github.io/LyricalmyricalWebsite/. This takes effect once the Cloud Functions update in this release is deployed; emails already sent keep their old links. The page that sends deep links (such as a shared book page) to the shop now also follows the shop address set at build time, so links keep working if the shop later moves to its own domain. A check now fails the build if the website and the email links ever disagree about the shop's address again.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
