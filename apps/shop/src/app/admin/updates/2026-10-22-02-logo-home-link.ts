import type { AppUpdate } from "../appUpdates";

export default {
  id: "logo-home-link",
  date: "2026-10-22",
  title: "The shop name always takes shoppers back to the home page",
  summary: "Clicking the shop name or logo at the top of the shop now opens the home page every time, from any page: a category, search results, a book or the bag. Before, on a category page it could leave the old address showing, and coming back from a book page could land on the catalog instead of the home page. It is also a real link now, so it can be opened in a new tab.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
