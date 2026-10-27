import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-needs-you-aligned",
  date: "2026-10-22",
  title: "Needs you on the Overview reads more easily, especially on a phone",
  summary:
    "In the black Needs you panel on the Overview, each count now lines up with the big total above it, with a single line between items instead of a doubled one. On a phone the panel has less padding, so the words and buttons use the width instead of wrapping into narrow columns. What the panel counts and where its buttons go are unchanged.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
