import type { AppUpdate } from "../appUpdates";

export default {
  id: "unused-packages-removed",
  date: "2026-10-17",
  title: "Behind the scenes: 11 unused code libraries removed",
  summary: "A routine upkeep pass removed eleven add-on libraries (Material UI, Emotion, a carousel, drag-and-drop and confetti helpers, and similar) that nothing in the shop or admin used. Nothing you see changes: the shop and admin look and work the same, the tests, type check and build all pass, and the storefront download size is unchanged. Fewer libraries means faster installs and less to keep patched. This is a code change only; it takes effect when the next storefront deploy runs.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
