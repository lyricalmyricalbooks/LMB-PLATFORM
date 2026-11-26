import type { AppUpdate } from "../appUpdates";

export default {
  id: "starter-page-fixes",
  date: "2026-11-26",
  title: "Tidier search, product pages and footers on starter websites",
  summary: "On the starter websites, the search box now uses your website's own font at a normal size instead of huge capital letters that ran out of the box. Product pages load your body font properly, so the tabs, \"Frequently bought together\" and related products no longer fall back to a plain default font, and the photos stay in view while you scroll a long description. Footers no longer show a made-up email address: until you add your email, they link to your Contact page.",
  links: [
    { label: "Online store", tab: "design" },
  ],
} satisfies AppUpdate;
