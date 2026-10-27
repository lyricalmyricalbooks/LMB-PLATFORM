import type { AppUpdate } from "../appUpdates";

export default {
  id: "url-redirects", date: "2026-10-11", title: "URL redirects, like Shopify",
  summary: "Renamed a book or page? Add a redirect from its old web address to the new one and bookmarks, search results and printed links stop landing on \"page not found\". Add them one at a time or paste a list. A redirect only applies when the old address has no page of its own, so it can never hide a real book or page, and loops are refused. Redirects are followed in the shopper's browser; this is saved with the website, no backend deploy is needed.",
  links: [{ label: "Open Settings › General", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
