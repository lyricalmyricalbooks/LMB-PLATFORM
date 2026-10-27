import type { AppUpdate } from "../appUpdates";

export default {
  id: "cheaper-background-jobs",
  date: "2026-10-20",
  title: "The shop's background jobs and site builds use less of Google Cloud",
  summary: "Maintenance to keep the shop inside Firebase's free allowances as it grows. Nothing you see changes. The Overview no longer reads every past day of visitor counts again each time it opens: days that can't change any more are kept while the admin is open, and only the last few days are read again. Several scheduled jobs do less: the photo-copy job runs hourly instead of every 15 minutes, the inventory app link does nothing at all while it isn't set up, the abandoned-cart reminder reads its settings only when a cart is waiting, and old unconfirmed newsletter sign-ups are found with a direct search instead of reading every pending one. Each site build now downloads each book photo once instead of once per page (about 120 downloads instead of 700), changing only tests no longer redeploys the backend, and old backend build images are kept for 3 days instead of 30. It needs the updated Cloud Functions and Firestore indexes to be deployed.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
