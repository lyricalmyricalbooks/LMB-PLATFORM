import type { AppUpdate } from "../appUpdates";

export default {
  id: "product-groups",
  date: "2026-11-18",
  title: "Tell us everything you sell",
  summary: "Sign-up now asks what you sell as a list you can tick more than once, such as clothing and candles and prints. Your shop then puts those kinds of products first when you add one. You can change the list any time in Settings › Your shop › What you sell.",
  links: [{ label: "What you sell", tab: "settings", settingsTab: "general" }, { label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
