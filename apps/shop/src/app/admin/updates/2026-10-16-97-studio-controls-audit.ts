import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-controls-audit",
  date: "2026-10-16",
  title: "Studio controls that did nothing now work",
  summary: "Every Studio control was checked against the preview. Line height and letter spacing now move all the shop's text, not just a few lines, and Riso headings follow Heading weight. A section's own Button corners, rich-text heading styles, Checkout field border and corners, the Add-to-bag size, the announcement text size, the Theme font, the Logo wordmark font and the Facebook, X and TikTok links now show. The preview bag shows a sample book so the Cart drawer controls can be seen. The full list, including the few that still need your decision, is in docs/STUDIO_CONTROL_AUDIT.md.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
