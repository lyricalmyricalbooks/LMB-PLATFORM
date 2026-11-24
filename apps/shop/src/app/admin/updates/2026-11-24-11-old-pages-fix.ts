import type { AppUpdate } from "../appUpdates";

export default {
  id: "old-pages-fix",
  date: "2026-11-24",
  title: "Your website never shows without its look",
  summary: "A shop that sells things other than books could have its website pages fail to refresh after an update, and then show plain unstyled text. The pages now refresh again, and if they ever can't, your site shows with its full look while they catch up.",
  links: [{ label: "Design", tab: "design" }],
} satisfies AppUpdate;
