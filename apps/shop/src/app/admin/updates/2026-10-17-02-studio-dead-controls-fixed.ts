import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-dead-controls-fixed",
  date: "2026-10-17",
  title: "The last Studio controls that did nothing now work",
  summary: "Five Studio controls found by the 16 October check now do what they say, and each starts at Off so the shop looks exactly as before until you choose a value: Space between sections (Layout & spacing), Book card shadow (Animations & hover effects), Breadcrumbs above a shop category (Show or hide whole features, words in Text & labels › Collection & wishlist pages), and the Design scales corner set, which now rounds shop-grid cards too. The old \"Spacing inside cards and grids\" control was removed because the shop grid already has its own gap control. Studio also explains two puzzles: a control on All pages now says when the page you are previewing uses its own value (with a button to use the all-pages one), and the book description's colour, alignment and font say when a Fine-tune setting for that element is drawn instead (with a button to use the control).",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
