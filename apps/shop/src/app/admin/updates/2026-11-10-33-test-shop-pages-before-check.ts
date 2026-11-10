import type { AppUpdate } from "../appUpdates";

export default {
  id: "test-shop-pages-before-check",
  date: "2026-11-10",
  title: "Updates no longer leave the test shop half-loaded",
  summary: "When an update reached the test shop, its pages were redrawn only after the final check, so for a while they pointed at files that had been replaced and screens stayed blank or slow. The pages are now redrawn first, then checked.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
