import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-description-fold",
  date: "2026-10-23",
  title: "Optional “Read more” for long book descriptions",
  summary:
    "Like many Shopify themes, a long book description can now show just its first lines, gently fading out, with a “Read more” button that opens the rest (and “Show less” to fold it again). Short descriptions are left alone, and the whole text stays in the page, so Google and screen readers still read every word. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, where you can also choose how many lines show first (8 to start), so the live shop is unchanged. The button words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
