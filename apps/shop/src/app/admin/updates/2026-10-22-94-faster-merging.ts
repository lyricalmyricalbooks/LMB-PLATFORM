import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-merging",
  date: "2026-10-22",
  title: "Changes clear their checks sooner and clash less",
  summary: "Maintenance only: the automatic checks that run before a change goes live no longer sometimes stall for 10 minutes while setting up their test browser, and the slowest check is split more evenly across machines. The list of Design studio controls is now one small file per control, so two changes that add different controls no longer block each other. Nothing in the admin or the shop looks different.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
