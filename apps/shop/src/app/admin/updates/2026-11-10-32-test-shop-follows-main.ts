import type { AppUpdate } from "../appUpdates";

export default {
  id: "test-shop-follows-main",
  date: "2026-11-10",
  title: "The test shop updates itself",
  summary: "Every change that is merged now goes to the test shop on its own, so it always shows the newest work. Real shops still only update when you say so.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
