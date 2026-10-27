import type { AppUpdate } from "../appUpdates";

export default {
  id: "release-notes-per-file", date: "2026-10-09", title: "Smoother releases behind the scenes",
  summary: "Each update to the admin now keeps its What's new note in its own file, so several improvements finished at the same time can be released without getting in each other's way. The What's new box and View all updates show exactly the same notes, in the same order, as before.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
