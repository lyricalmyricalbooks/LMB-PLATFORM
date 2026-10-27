import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-preview-follows-edits",
  date: "2026-10-12",
  title: "The Studio preview keeps up with every change",
  summary:
    "Fixed the times the Design studio preview didn't react to an edit. Previewing a theme (Themes › Preview) or an old version now ends as soon as you change the draft (an inspector edit, a canvas edit or Undo), so the canvas shows your change instead of the look you were previewing. Opening a page in Pages now shows that page in the canvas, and words you type there appear before you save. If a setting makes the preview hit an error, your next change retries it, with no reload needed. Releasing a spacing handle outside the preview no longer leaves the canvas paused. Pages that load later (book pages, order tracking, missing page) start from your unsaved draft too.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
