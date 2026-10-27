import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-3-live-sync", date: "2026-10-09", title: "The Design studio notices saves from your other tabs",
  summary: "If you have the Design studio open in two tabs or on two devices, a save or publish in one now shows up in the other straight away, instead of only when you next press Save. If you have no unsaved edits, the other version simply comes in. If you do, a bar at the top tells you, and you choose: Bring in their changes (your edits stay; where you both changed the same thing, yours is kept), Use their version (asks first, because it replaces your unsaved edits), or Later. Studio never overwrites your unsaved work on its own. Tested with local checks only.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
