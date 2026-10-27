import type { AppUpdate } from "../appUpdates";

export default {
  id: "site-address-rename", date: "2026-10-10", title: "Shop styling restored after the repository rename",
  summary: "The shop had been showing as a plain, unstyled page with every menu visible at once. The GitHub repository was renamed from LyricalmyricalWebsiteTrial to LyricalmyricalWebsite, so GitHub Pages now serves the shop at lyricalmyricalbooks.github.io/LyricalmyricalWebsite/, but the site was still built for the old …/LyricalmyricalWebsiteTrial/ address, so its style and script files could not be found. The site, its sitemap, robots file and sharing links now use the new address, and the release process takes the address from the repository's name, so a future rename can't break the site this way again. Links to the old …Trial address (bookmarks, old search results, links already shared) no longer open the shop; share the new address. Order and other emails still link to the old address until the matching Cloud Functions update is released.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
