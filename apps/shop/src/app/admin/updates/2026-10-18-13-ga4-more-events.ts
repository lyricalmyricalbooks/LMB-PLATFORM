import type { AppUpdate } from "../appUpdates";

export default {
  id: "ga4-more-events",
  date: "2026-10-18",
  title: "Google Analytics now sees book lists, searches, checkout steps and sign-ups",
  summary: "The shop now tells Google Analytics which books shoppers saw in each list (the shop grid by category, every section, related books, recently viewed, wishlist and search results) and which one they opened, what they searched for (and searches that found nothing), when they chose delivery and when they pressed Pay, books saved to the wishlist, newsletter sign-ups and back-in-stock sign-ups. In Google Analytics they appear under Reports › Monetization › E-commerce purchases (item list name), Reports › Engagement › Events and Explore › Funnel exploration. Your own visits and declined cookies are still never counted. New data shows from the day this version is live.",
  links: [{ label: "Google Analytics", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
