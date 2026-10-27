import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-one-header", date: "2026-10-09", title: "One header and footer on every page",
  summary: "Your shop's header (announcement bar, logo, categories, search, wishlist, account, currency and bag) and footer are now built once and shared by every page, so a change in the Design studio shows up everywhere at the same time. The wishlist, account, order-tracking and \"page not found\" pages now show the same header and footer as the rest of the shop, with their own title bar underneath. If you'd rather keep those pages plain, switch off Theme settings › Header & announcement bar › \"Show the shop header & footer on wishlist, account, order tracking and missing pages\". Also fixed: on product and custom pages, the category links shrank slightly even when there was room; they now stay at the size you chose. Checkout keeps its own short header.",
  links: [{ label: "Open Page layout", tab: "settings", settingsTab: "designer", studio: "#designer?tab=sections" }],
} satisfies AppUpdate;
