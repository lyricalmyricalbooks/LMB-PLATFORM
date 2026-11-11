import type { AppUpdate } from "../appUpdates";

export default {
  id: "home-tiles-fit",
  date: "2026-11-11",
  title: "Home tiles fit on laptop screens",
  summary: "On a laptop, Latest orders on Home now shows each order on two tidy lines (number and amount, then the buyer's name and status), so names no longer squeeze to a letter per line. Today's takings also shrink to fit their tile instead of touching its edge.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
