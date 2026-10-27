import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-command-palette", date: "2026-10-09", title: "Find anything does more, and Show on page always lands somewhere",
  summary: "In the Design studio, Find anything (Ctrl+K, ⌘K on a Mac) now starts with what you can do to whatever you've selected — duplicate, hide, move or copy the style of a section, or open a page part in Theme settings — then the things you opened recently. It also finds the parts of the page you're previewing (like the buy card or the bag) and your books (it opens that book's page). Type > first to see commands only; each command shows its keyboard shortcut. A search that says \"phone\" or \"tablet\" now opens that screen size's setting. Show on page in Theme settings now waits for the page to finish loading, works for Customer accounts and Badges, and when a part isn't on the page (for example it's switched off) it opens that part's settings instead. Behind the scenes, unpublished designs are now only ever saved in the studio's private storage, never in the settings your shop's visitors download.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
