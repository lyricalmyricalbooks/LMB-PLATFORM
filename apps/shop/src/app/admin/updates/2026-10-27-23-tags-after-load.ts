import type { AppUpdate } from "../appUpdates";

export default {
  id: "tags-after-load",
  date: "2026-10-27",
  title: "The shop's first page loads sooner",
  summary: "Google Analytics and Microsoft Clarity now start after the page has finished loading, so the book photos and the shop itself get the connection first. Visit counts and recordings work the same; only the order things download in changed. Nothing is needed from you.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
