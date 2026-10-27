import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-private-drafts", date: "2026-10-08", title: "Private drafts and safe saving in two tabs",
  summary: "Your unpublished Design studio draft and My themes are now stored privately instead of in the settings every shopper's browser downloads, so the shop loads less data and unannounced designs stay hidden. My themes no longer has a size limit. If the studio is open in two tabs or devices, saving no longer silently overwrites the other one: changes to different settings are combined, and you choose when both changed the same setting. This needs the updated Firestore rules deployed; until then the studio keeps working as before.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
