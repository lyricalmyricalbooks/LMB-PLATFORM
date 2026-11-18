import type { AppUpdate } from "../appUpdates";

export default {
  id: "plain-words-admin",
  date: "2026-11-18",
  title: "Everyday words across the admin",
  summary: "The admin now says pack and ship instead of fulfil and dispatch, website instead of storefront, item code instead of SKU, and check reviews instead of moderate. Orders show To ship and Done, and each page's one-line description is shorter and plainer. Spreadsheets you bring in or download keep their usual column names.",
  links: [{ label: "Orders", tab: "orders" }, { label: "Products", tab: "catalog" }],
} satisfies AppUpdate;
