import type { AppUpdate } from "../appUpdates";

export default {
  id: "starter-policy-words",
  date: "2026-10-29",
  title: "Starter shipping and returns wording for any kind of product",
  summary: "If you sell something other than books, \"Start from our wording\" in Settings › General › Store policies now says product instead of book, and the returns wording offers a swap for a different size or colour while stock lasts. Shops that sell books get exactly the same wording as before, and anything you have already written is never changed.",
  links: [{ label: "Open Settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
