import type { AppUpdate } from "../appUpdates";

export default {
  id: "openrouter-ai",
  date: "2026-10-18",
  title: "Write with AI can use an OpenRouter key",
  summary: "Settings › General › AI writing assistant has a new OpenRouter box. One OpenRouter key opens many AI models (Google, OpenAI, Anthropic, Meta and others, including free ones whose names end in :free). Paste a key from openrouter.ai/keys, choose Save key, and the shop checks it straight away. You can also name the model to use; leave it blank for google/gemini-2.5-flash. If you keep both a Google key and an OpenRouter key, a drop-down chooses which one writes the drafts. Every Write with AI, Describe with AI and Rewrite with AI button works with either. The shop still sends only public book facts or the words you are editing. This needs the updated Cloud Functions to be deployed.",
  links: [{ label: "AI writing assistant", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
