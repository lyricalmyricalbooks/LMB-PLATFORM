import type { AppUpdate } from "../appUpdates";

export default {
  id: "ai-rewrite-keeps-pictures",
  date: "2026-10-15",
  title: "Rewrite with AI now works on text with pictures, and on your custom pages",
  summary: "Rewrite with AI used to refuse any text that had a picture, video, divider line, centred line or indent in it. Now it rewrites only the words and puts each picture, video, divider and line layout back in its place. The pictures themselves are never sent to Google. If the AI drops, repeats or reorders one, nothing changes and Studio says so. Studio › Pages has the button too, under each page's text. Its Undo puts the old words back unless you've changed the page since. Coloured or highlighted words still can't be rewritten: remove the colour first or edit by hand. AI can get facts wrong, so read the result before you publish.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
