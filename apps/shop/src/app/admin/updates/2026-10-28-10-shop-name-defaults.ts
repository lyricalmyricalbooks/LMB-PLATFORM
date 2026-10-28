import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-name-defaults",
  date: "2026-10-28",
  title: "Type your shop's name once and the whole shop uses it",
  summary: "Your shop's name now lives in one place: Design › Text & labels › Site & sharing › Site name. The logo words in the header and footer, the copyright line, the checkout header, the loading screen, review replies, the admin's own title and the sign-off of every email follow it until you type something else there. Ready-made looks no longer type a name into your logo. Sections can show the name too: write {{shop.name}} in any section's text, or connect a field to Shop › Shop name. Starting words that described another press (its city and history) are now neutral.",
  links: [
    { label: "Open Text & labels", tab: "settings", settingsTab: "designer", studio: "designer?tab=text" },
    { label: "Open Email sender", tab: "settings", settingsTab: "notifications" },
  ],
} satisfies AppUpdate;
