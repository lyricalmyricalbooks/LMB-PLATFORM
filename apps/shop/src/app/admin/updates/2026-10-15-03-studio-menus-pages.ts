import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-menus-pages",
  date: "2026-10-15",
  title: "Renaming a page keeps its links working; menu links warn when broken",
  summary: "When you change a custom page's web address in Studio › Pages and save, menu links that pointed at the old address now follow it, and for a page that was already live an old-address redirect is added in Settings › URL redirects so bookmarks and search results still open the page. In Navigation, a menu link with no name, no destination or a page that no longer exists now shows a red warning, and removing a menu link can be undone from the message that appears. Deleting a shop category that would move or remove books from it now asks first. In Text & labels, words in { } (like {title}) are pointed out so they aren't deleted by mistake. The sticker-pill corner setting explains its format, the phone masthead size slider has a sensible range, and choosing Inherit for menu link case no longer turns the links back to capitals.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
