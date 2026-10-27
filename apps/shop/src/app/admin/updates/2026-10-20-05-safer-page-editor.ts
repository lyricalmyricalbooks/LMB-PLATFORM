import type { AppUpdate } from "../appUpdates";

export default {
  id: "safer-page-editor",
  date: "2026-10-20",
  title: "The page text editor runs on a newer, maintained version",
  summary: "The text editor in Studio › Pages and in rich-text sections moved from an old, unmaintained version of its editing library to the current one, which also closes a security warning about the old version. Pages you already wrote open and save exactly as before: bullets stay bullets, numbered lists stay numbered, and pictures, videos, dividers, alignment and indents are kept. Pictures pasted or dropped into a rich-text section are now uploaded instead of being stored inside the text. The editor now loads only when you open it.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
