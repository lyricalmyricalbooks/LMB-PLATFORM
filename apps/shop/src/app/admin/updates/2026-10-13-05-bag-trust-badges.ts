import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-trust-badges",
  date: "2026-10-13",
  title: "Shopping bag: hide each trust badge on its own",
  summary: "The Secure, Tracked and Returns badges under the bag total can now be switched off one at a time, so you can drop the Returns badge without losing the other two. The remaining badges share the row evenly. Find them in Studio › Theme settings › Cart drawer (shopping bag) › Total & checkout button; their words stay in Text & labels › Cart. Nothing changes until you switch one off.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
