import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-closed-dialogs",
  date: "2026-10-27",
  title: "Studio does less work on every edit",
  summary: "Two windows in Studio, Keyboard shortcuts and Schedule publishing, used to prepare their contents on every change you made, even while they were closed. Now they get ready only when you open them, so each click and keystroke in Studio has less to do. They look and work the same as before. This also makes the automatic Studio checks faster, so they stop failing by chance on a busy test machine.",
  links: [{ label: "Open Design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
