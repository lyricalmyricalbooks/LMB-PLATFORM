import type { AppUpdate } from "../appUpdates";

export default {
  id: "collection-links-shipping-seo",
  date: "2026-10-19",
  title: "Google can now find your collection pages, and book listings show shipping and returns",
  summary: "The categories in the shop header (PUBLICATIONS, Books, Zines) are now real links to their collection pages, so Google can reach them from every page instead of only through the sitemap. Clicking a category still opens it in place as before. Each collection's search description is now its own intro paragraph instead of one shared sentence. Every printed book's listing now tells Google what one copy costs to ship within Canada (the cheapest option in Settings › Shipping, with its delivery days) and that books can't be returned once shipped, as your Returns policy says. Change either in Design › Text & labels › Site & sharing. Google picks this up as it recrawls the pages.",
  links: [{ label: "Shipping settings", tab: "settings", settingsTab: "shipping" }, { label: "Text & labels in Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
