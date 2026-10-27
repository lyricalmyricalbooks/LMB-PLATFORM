import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-folder",
  date: "2026-10-27",
  title: "Overview code in its own folder",
  summary: "The Overview page's files now sit together in their own folder instead of mixed in with orders, catalog and settings. Future fixes to any admin page are quicker to find and less likely to touch the wrong file. Nothing on the Overview changes.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
