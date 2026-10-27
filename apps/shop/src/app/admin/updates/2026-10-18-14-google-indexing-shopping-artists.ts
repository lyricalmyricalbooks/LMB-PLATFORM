import type { AppUpdate } from "../appUpdates";

export default {
  id: "google-indexing-shopping-artists",
  date: "2026-10-18",
  title: "See which books are on Google, and artist names in Google Shopping",
  summary: "Books › More catalog actions › Google indexing asks Google which of your book pages are in its search results, when it last visited each one and why a page isn't in yet, with a button that opens that page in Search Console, where Request indexing lives (Google doesn't let shops request it any other way). It uses the Search Console connection from Settings › General › Google Search Console; if Google says the shop lacks permission, give its account Full permission there. The Google Shopping feed now names the artist in each listing's title (\"The Hound by Ian Willms\") and lists them as the book's author, so Shopping can match searches for their name. Both start working once the latest Cloud Functions and site are deployed; checked with local tests only, not yet against Google.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Google Search Console", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
