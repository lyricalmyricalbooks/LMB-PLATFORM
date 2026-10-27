import type { AppUpdate } from "../appUpdates";

export default {
  id: "search-console-token", date: "2026-10-11", title: "Google Search Console: verify through Studio",
  summary: "A Google Search Console verification tag added straight into the site's code never reached the pages Google checks: the shop replaces it with the token saved in Studio, and that token was empty. The hand-added tag is removed and a check now stops it being added that way again. To verify the shop's new address, paste the token Google gives you (the content value of its HTML tag) into Studio › Text & labels › Site & sharing › Google Search Console verification token and press Publish. Within about 15 minutes the shop's pages carry it; then press Verify in Search Console and submit sitemap.xml.",
  links: [{ label: "Open Text & labels", tab: "settings", settingsTab: "designer", studio: "#designer?tab=text" }],
} satisfies AppUpdate;
