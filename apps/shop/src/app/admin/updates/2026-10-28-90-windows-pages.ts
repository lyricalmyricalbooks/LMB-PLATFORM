import type { AppUpdate } from "../appUpdates";

export default {
  id: "windows-pages",
  date: "2026-10-28",
  title: "Shop pages open on Windows computers again",
  summary: "When the shop was run on a Windows computer, every shop page showed \"Something went wrong\" because two files with almost the same name got mixed up. The shop now always picks the right one, and an automatic check stops it happening again. A new stockroom also starts empty instead of showing a few sample books that belonged to someone else.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
