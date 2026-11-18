import type { AppUpdate } from "../appUpdates";

export default {
  id: "own-types",
  date: "2026-11-18",
  title: "Name your own product types",
  summary: "When you add a product and type something we don't list, such as beeswax wraps, you can keep it as your own type. You pick the closest of ours, so the page asks the right questions, and next time it is offered by name at the top of the list. Settings › Your shop › What you sell lists your own types, and you can remove one there without changing your products.",
  links: [{ label: "Books", tab: "catalog" }, { label: "What you sell", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
