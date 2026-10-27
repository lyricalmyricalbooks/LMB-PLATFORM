import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-shop-start",
  date: "2026-10-21",
  title: "Shop pages start loading the header and footer sooner",
  summary: "The code for the shop's header and footer now downloads alongside the main script instead of after it, so the shop appears a little sooner on a first visit. Nothing about how the shop looks or works changes. This takes effect after the next storefront deploy.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
