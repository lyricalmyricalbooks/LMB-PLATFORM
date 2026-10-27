import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-what-changed-phone",
  date: "2026-10-22",
  title: "What changed on the Overview reads cleanly on a phone",
  summary:
    "In the What changed panel on the Overview, each line's Up or Down badge now sits above its title when the panel is narrow (on a phone, or in a small panel on a computer). The title and the figures use the full width instead of wrapping two or three words to a line beside a wide badge. Which changes are listed is unchanged, and wide panels look exactly as before.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
