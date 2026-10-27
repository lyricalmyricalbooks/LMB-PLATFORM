import type { AppUpdate } from "../appUpdates";

export default {
  id: "deploy-check-waits",
  date: "2026-10-18",
  title: "Shop updates no longer fail while the new version is still spreading",
  summary: "After each update goes live, an automatic check visits the shop to confirm every page is the new version. Firebase can keep showing the previous version for a few seconds to a minute, so that check sometimes failed even though the update had worked. When that happened, the forwarding pages at the old github.io address weren't refreshed. The check now tries any page that hasn't caught up again for about three minutes before calling the update failed. A real problem still fails it. Nothing changes in the admin.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
