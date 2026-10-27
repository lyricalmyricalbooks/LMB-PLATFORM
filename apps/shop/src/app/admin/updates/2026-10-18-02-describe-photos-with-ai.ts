import type { AppUpdate } from "../appUpdates";

export default {
  id: "describe-photos-with-ai",
  date: "2026-10-18",
  title: "Describe book photos with AI",
  summary: "Books › edit › Images has a Describe with AI button under each photo, and a button at the top that describes every photo without a real description, one after another. Gemini looks at the photo and the book's details and writes a short description (alt text), which screen readers and Google Images read. Check each one, then save the book; nothing is saved until you do. Many imported photos had their file names (\"01\", \"IMG_9564\") saved as their description; the shop now ignores those and uses its own wording (\"Title — view 2\") until you replace them. Book pages also keep the Details record (edition, pages, size, paper, credits) in the page for Google while the Description tab is open; before, Google only saw the tab that was open. Describe with AI needs the free Google AI key in Settings › General › AI writing assistant and the updated Cloud Functions.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Settings › General", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
