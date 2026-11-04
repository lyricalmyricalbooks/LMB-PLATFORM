import type { AppUpdate } from "../appUpdates";

export default {
  id: "try-on-looks",
  date: "2026-11-04",
  title: "Try a look on before you choose it",
  summary: "Choose your look now works like a theme store. Every card shows a whole shop page in that look, with filters for full templates, light and dark looks. Try it on opens the look full screen with your own products or sample ones, on a computer or a phone, on the home page or a product page, and the arrows flip from one look to the next.",
  links: [{ label: "Open Home", tab: "overview" }, { label: "Open Design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
