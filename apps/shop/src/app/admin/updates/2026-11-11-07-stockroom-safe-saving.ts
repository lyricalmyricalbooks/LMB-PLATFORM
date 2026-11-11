import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-safe-saving",
  date: "2026-11-11",
  title: "Groundwork for changing stockroom records from your admin",
  summary: "Nothing looks different yet. Your admin can now save stockroom records the careful way: it reads what is stored, merges in anything another device saved a moment earlier, and says plainly when something could not be saved. It is the base the next stockroom pages will use to record sales and expenses without ever overwriting someone else's work.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
