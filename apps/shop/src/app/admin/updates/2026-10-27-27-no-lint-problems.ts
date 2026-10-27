import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-lint-problems",
  date: "2026-10-27",
  title: "The code checker finds nothing left to fix",
  summary: "Behind the scenes, the last 94 leftover names the code checker flagged (imports and values nothing used any more) were removed across the shop, the admin and the server. Nothing changes on screen; from now on any new leftover stops a change before it goes live.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
