import type { AppUpdate } from "../appUpdates";

export default {
  id: "review-summary-index",
  date: "2026-10-18",
  title: "Book pages can count their reviews again",
  summary: "Each book page asks the database for the number of approved reviews and their average rating. That question needed a database index the shop didn't have yet, so it was refused on every book page and the page fell back to counting only the reviews it had loaded. The missing index is now part of the shop's database settings and goes live with the next Firebase deploy. Found by the new daily code health and speed report.",
  links: [{ label: "Open Reviews", tab: "reviews" }],
} satisfies AppUpdate;
