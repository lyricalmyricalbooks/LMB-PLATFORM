import type { AppUpdate } from "../appUpdates";

export default {
  id: "related-sold-out-badge",
  date: "2026-10-12",
  title: "Sold-out books look the same everywhere",
  summary:
    "The “From the Catalogue” row under a book showed sold-out books with its own white pill and a dark shade you couldn't change. It now uses the sold-out badge you set in Studio › Theme settings › Product cards & grid › Sold-out badge (tag, stamp, band or small box, its colours, size and how much the photo is greyed out), the same as the shop grid. Turning “Show “sold out” badge” off there hides it in this row too. The book page's grid and stacked photo layouts use the same badge as well. The words stay in Text & labels.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
