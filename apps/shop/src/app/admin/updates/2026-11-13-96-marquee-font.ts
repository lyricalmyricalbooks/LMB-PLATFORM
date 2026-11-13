import type { AppUpdate } from "../appUpdates";

export default {
  id: "marquee-font",
  date: "2026-11-13",
  title: "The Marquee look keeps its heading font",
  summary: "The Marquee look's tall heading font was missing from the font list in Studio, so the heading font picker read as not set and the heavier weights could not load. The font is now in the list, so the picker shows it and every weight you choose appears in your shop. The full Studio click-through now also runs on every update before it reaches a shop.",
  links: [{ label: "Open Design", tab: "design" }],
} satisfies AppUpdate;
