import type { AppUpdate } from "../appUpdates";

export default {
  id: "page-skeleton",
  date: "2026-10-26",
  title: "Admin pages open with a placeholder instead of a spinner",
  summary: "While an admin page loads for the first time, you now see the outline of the page (title, figures and rows) instead of a lone spinner, so nothing jumps around when the content arrives. People who prefer reduced motion see it without the shimmer.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
