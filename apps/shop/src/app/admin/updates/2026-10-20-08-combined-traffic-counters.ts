import type { AppUpdate } from "../appUpdates";

export default {
  id: "combined-traffic-counters",
  date: "2026-10-20",
  title: "The shop's own visitor counter saves in fewer writes",
  summary: "Maintenance only: the shop's visitor counter now saves the counts from one moment together, in fewer database writes. A visitor's visit, source and device used to take two writes and now take one. A book page used to take three writes plus one per category, and now takes one plus one per extra category. This lowers the Firebase bill. Overview figures are counted the same way and look the same. If the database refuses a combined write, each count is sent on its own, as before.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
