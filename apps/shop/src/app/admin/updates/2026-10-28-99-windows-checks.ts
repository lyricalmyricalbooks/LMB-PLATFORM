import type { AppUpdate } from "../appUpdates";

export default {
  id: "windows-checks",
  date: "2026-10-28",
  title: "The shop's automatic checks now also run on Windows",
  summary: "Before any change reaches your shop, its automatic checks now run on a Windows computer as well as the usual one. A few checks only worked with one kind of folder path; they now work with both. Nothing in your admin changes; this makes it safer to work on the shop from any computer.",
  links: [{ label: "Open Settings", tab: "settings" }],
} satisfies AppUpdate;
