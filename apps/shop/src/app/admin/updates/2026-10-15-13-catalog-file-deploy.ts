import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-file-deploy",
  date: "2026-10-15",
  title: "Catalog file change can now go live",
  summary: "The previous update (the shop reading its catalog from a file) was stopped by the Firebase deploy check before anything went live, so the shop kept working exactly as before. The three small background jobs that record catalog changes now retry a failed save themselves, which the deploy accepts. If a save still fails after several tries, the regular site refresh rebuilds the file within about 15 minutes. This needs the next Firebase and storefront deploys; local tests don't prove them.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
