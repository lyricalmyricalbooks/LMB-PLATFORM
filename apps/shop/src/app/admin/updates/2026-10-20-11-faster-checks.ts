import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-checks",
  date: "2026-10-20",
  title: "Changes reach the shop sooner after they're approved",
  summary: "Maintenance only: the automatic checks that run before a change is merged now split the two long Design studio checks across several machines, so they finish in about a third of the time, and they no longer run a second time after the merge. That frees machines for the deploy, so with several changes in flight the shop updates sooner. Every check still runs on every change; nothing in the admin or the shop looks different.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
