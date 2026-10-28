import type { AppUpdate } from "../appUpdates";

export default {
  id: "old-shop-links",
  date: "2026-10-28",
  title: "Old product links keep working after you move",
  summary: "When you bring books over from your old shop's export, each book's old web address is saved as a redirect. Once your shop's address points here, links people bookmarked, shared or found in search open the same book in this shop. Redirects you set yourself are never replaced, and importing the same file again adds nothing new. You can see the list, or remove one, in Settings › General › URL redirects.",
  links: [
    { label: "Open URL redirects", tab: "settings", settingsTab: "general" },
    { label: "Import books", tab: "catalog" },
  ],
} satisfies AppUpdate;
