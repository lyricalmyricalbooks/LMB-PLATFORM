import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-3-history", date: "2026-10-09", title: "Checkpoints and side-by-side version history",
  summary: "Version history in the Design studio (Theme actions › Version history) is easier to use. Save a named checkpoint before a big change — checkpoints are kept until you delete them, while older published versions still age out after 30. Pin any published version to keep it too, rename it, or delete one you no longer need. Compare shows, in plain words, what is different between a version and your current draft, the live site or another version: which colours, words and settings changed and which sections were added, removed, moved or edited. When comparing with your draft, Use this version's takes back just that one change, and Undo reverses it. Previewing and restoring only change your draft; nothing goes live until you Publish. The Publish and Discard confirmations now list changes the same readable way. Tested with local checks only.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
