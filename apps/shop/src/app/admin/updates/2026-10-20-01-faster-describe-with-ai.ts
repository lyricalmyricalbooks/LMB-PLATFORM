import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-describe-with-ai",
  date: "2026-10-20",
  title: "Describe with AI is faster, and OpenRouter takes over when Google runs out",
  summary: "Describing all of a book's photos now works on three photos at a time instead of one after another, so a run finishes about three times sooner, and one photo that fails no longer stops the rest. When Google's free AI allowance is used up, the shop first tries Google's other models (each has its own allowance) and then, if you have also saved an OpenRouter key in Settings › General › AI writing assistant, lets OpenRouter write instead. The message after a run says when that happened. This works for every Write with AI, Describe with AI and Rewrite with AI button. It needs the updated Cloud Functions to be deployed.",
  links: [{ label: "AI writing assistant", tab: "settings", settingsTab: "general" }, { label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
