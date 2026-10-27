import type { AppUpdate } from "../appUpdates";

export default {
  id: "coming-soon-books",
  date: "2026-10-12",
  title: "Show a book as Coming soon",
  summary:
    "Books › edit › Inventory has a new Coming soon switch. The book shows in the shop with a “Coming soon” badge, and its page has a Coming soon button (instead of Add to bag) that lets shoppers leave their email. It can't be added to a bag or bought until you turn the switch off; then everyone who signed up gets an “Out now” email. Add a Publication date to show “Coming <date>”. The words are in Design › Text & labels › Product page, and the badge and signup box can be hidden in Theme settings. The email on release needs the updated Cloud Functions deployed, and has only been checked locally.",
  links: [{ label: "Set a book to Coming soon in Books", tab: "catalog" }, { label: "Edit Coming soon words in Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
