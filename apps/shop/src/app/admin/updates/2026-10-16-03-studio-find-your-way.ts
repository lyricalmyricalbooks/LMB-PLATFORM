import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-find-your-way",
  date: "2026-10-16",
  title: "Studio: find things in your own words, go Back, and view your draft website",
  summary: "View website, in Studio's top bar, opens your shop in a new tab with your draft. A note at the bottom says whether it includes changes you haven't saved, is your saved draft, or already matches the live shop. Shoppers keep seeing the live shop until you press Publish. Find (Ctrl K) now understands everyday words and small spelling mistakes: try “make the buttons rounded”, “logo size”, “add to cart” or “annoucement”. Each result shows where it lives, and when nothing matches you get suggestions and Browse buttons. Under the top bar is the full path to what you're editing (for example Theme settings › Top of every page). Click any part of it to step out. ← Back (or Alt+←) takes you to where you were before your last jump. Theme settings now opens with a “Where is it on the shop?” map and lists the parts of your shop top to bottom, with plainer names such as “Book cards in the shop grid” and “Book page · buy box & details”. In Page layout, each part of the page has Style and Words shortcuts.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
