import type { AppUpdate } from "../appUpdates";

export default {
  id: "favicon-every-page",
  date: "2026-10-13",
  title: "Your shop's tab icon now shows on every page",
  summary: "The little picture in the browser tab (Studio › Theme settings › Favicon) only appeared after a shopper visited the home page. Pages opened directly — Track order from an email link, Checkout, a book, a custom page, Wishlist or Account — showed a blank globe instead. They now all show your icon. Nothing to change in your settings; it applies once this version is live.",
  links: [{ label: "Change the favicon", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
