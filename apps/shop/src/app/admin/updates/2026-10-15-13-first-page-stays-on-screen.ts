import type { AppUpdate } from "../appUpdates";

export default {
  id: "first-page-stays-on-screen",
  date: "2026-10-15",
  title: "The shop shows up sooner and no longer flashes a loading screen",
  summary: "When someone opened the shop, their browser first showed the finished page with empty grey boxes where the book photos go, then swapped it for the loading screen, then showed the page again with the books fading in. Now the first page shows the book photos straight away and stays on screen while the shop finishes loading behind it, with no loading screen and no second fade-in. The first photos are fetched before the rest, and the fonts no longer hold up the first paint. Nothing about how the shop looks has changed. Measured on this branch with a simulated phone, not yet on the live site.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
