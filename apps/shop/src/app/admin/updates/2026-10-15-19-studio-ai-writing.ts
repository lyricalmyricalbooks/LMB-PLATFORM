import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-ai-writing",
  date: "2026-10-15",
  title: "Studio: rewrite any words with AI, or draft a whole section from a sentence",
  summary: "Under the text boxes in Studio there is now a Rewrite with AI button. This covers a section's words and every entry in Text & labels. Choose Improve, Shorter, A little longer, Friendlier, More formal or Fix spelling & grammar, or type what you'd like changed. In Page layout › Add section, Draft a section with AI writes a hero banner, image with text, text block, questions & answers, newsletter sign-up or feature grid from a short description. The draft shows on the page first, and nothing is added until you choose Add to page. Both use your free Google AI key from Settings › General › AI writing assistant. Only the words you're working on are sent, never customer or order details. Shop placeholders like {year} and your links are kept. Every change can be undone, and nothing goes live until you Publish. AI can still get facts wrong, so read each draft before you publish.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }, { label: "AI settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
