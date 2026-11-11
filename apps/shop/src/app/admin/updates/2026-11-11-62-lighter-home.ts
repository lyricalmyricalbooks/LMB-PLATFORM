import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-home",
  date: "2026-11-11",
  title: "Home opens faster",
  summary: "Home now loads only what it shows: your to-do list, today's sales and the setup guide. It used to download the whole old figures board and read your newsletter list and visitor counts every time it opened, though none of that was on screen. Home now downloads about a tenth as much and makes fewer reads, so it opens quicker, especially on a phone. Analytics still has every figure.",
  links: [{ label: "Open Home", tab: "overview" }, { label: "Open Analytics", tab: "analytics" }],
} satisfies AppUpdate;
