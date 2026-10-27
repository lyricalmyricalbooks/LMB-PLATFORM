import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-theme-system", date: "2026-10-09", title: "Theme settings, sorted into your site's look and its parts",
  summary: "Theme settings in the Design studio now opens in three parts. \"Site-wide design\" holds what every page shares: theme presets, logo, colours, fonts, buttons, spacing and the Riso print look. \"Parts of your shop\" holds the header and footer, the shop and book pages, and the bag, checkout and account pages — each has a \"Show on page\" button that opens that page in the preview (or opens the shopping bag) and selects the part, so you can see what you're changing. Long word lists in Text & labels (Checkout, Order tracking, Customer account, Product page, Cart) are split into short sections such as \"Discount codes\" and \"Error messages\". Find anything gives shorter result lists and opens an element's setting at the screen size you're previewing.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
