import type { AppUpdate } from "../appUpdates";

export default {
  id: "on-sale-filter",
  date: "2026-10-13",
  title: "Shop filters: shoppers can show only books on sale",
  summary: "The shop's filter bar now has an On sale button beside In stock, like Shopify's collection filters. It appears only when at least one book in the current view has a sale running, keeps only books whose sale price is actually charged, and Clear filters resets it. You can hide it, change its spacing or style per device in Theme settings › Fine-tune single elements › Catalog & shared content · layout › On-sale filter, and reword it in Text & labels › Search & filters › On-sale toggle. This is a display filter only; prices charged at checkout are unchanged.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=copy" }],
} satisfies AppUpdate;
