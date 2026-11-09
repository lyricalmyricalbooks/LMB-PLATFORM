import type { AppUpdate } from "../appUpdates";

export default {
  id: "product-addresses-follow-what-you-sell",
  date: "2026-11-04",
  title: "Product addresses say \"products\" if you don't sell books",
  summary: "A shop that sells clothing, music or other goods now gets product pages at addresses ending in /products/ instead of /books/. This covers its links, the sitemap, the Google Shopping file and links in emails and social posts. Every old /books/ link still opens the same page, and book shops see no change.",
  links: [{ label: "Open Products", tab: "catalog" }],
} satisfies AppUpdate;
