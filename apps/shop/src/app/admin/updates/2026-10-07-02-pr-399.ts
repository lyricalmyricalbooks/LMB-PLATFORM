import type { AppUpdate } from "../appUpdates";

export default {
  id: "pr-399", date: "2026-10-07", title: "Shipping previews, returns and publishing checks",
  summary: "Shoppers can preview shipping in the cart. Orders have a return workflow, and books get a review before publishing.",
  links: [{ label: "Review returns in Orders", tab: "orders" }, { label: "Review books before publishing", tab: "catalog" }, { label: "Manage shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
