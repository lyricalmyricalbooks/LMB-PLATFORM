import type { AppUpdate } from "../appUpdates";

export default {
  id: "ai-writing-assistant",
  date: "2026-10-13",
  title: "Write with AI: search listings and book descriptions",
  summary: "Add a free Google AI Studio key in Settings › General › AI writing assistant, and new Write with AI buttons draft a book's search title and description (Books › edit › Search (SEO)), a book description (Books › edit › Details), and a custom page's search listing (Studio › Pages). Drafts appear in the box for you to check; nothing is saved until you save. An optional house style tells the AI how to sound. Only public catalog facts are sent to Google. Needs the updated Cloud Functions to be deployed.",
  links: [
    { label: "Add the AI key", tab: "settings", settingsTab: "general" },
    { label: "Open Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
