import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-sale-price-parts-studio",
  date: "2026-10-12",
  title: "Studio: style or hide the sale price parts on book pages",
  summary:
    "When a book is on sale, its page shows the old price crossed out and a \"Save …\" badge. Both can now be clicked in the Studio preview and have their own show/hide switch, colours, text size, spacing and corners for desktop, tablet and phone in Settings › Design › Theme settings › Advanced › Fine-tune single elements › Product details · content layout (or just click them on a sale book in the preview). The badge's words stay in Text & labels › Product page › Sale savings badge. Nothing changes on the live site until you set one.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
