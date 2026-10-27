import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-fewer-reads",
  date: "2026-10-20",
  title: "Overview and book photos use less of the shop's cloud allowance",
  summary: "Nothing looks different; this is a cost change. While the Overview is open it reuses the orders the admin already checks every 5 minutes instead of reading them a second time when it can, and it keeps carts, sign-ups, Search Console and Google Analytics figures for 5 minutes, so leaving the Overview and coming straight back doesn't read them again (Refresh still reads everything fresh). In Books › edit › Images, the photo tiles, the cover beside the editor and Crop & edit load a right-sized copy of each photo instead of the largest one.",
  links: [{ label: "Overview", tab: "overview" }, { label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
