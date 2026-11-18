import type { AppUpdate } from "../appUpdates";

export default {
  id: "polish-switches-channels",
  date: "2026-11-18",
  title: "Clearer switches and tidier lists",
  summary: "Off switches now show a grey track, so ones sitting on the page (like Show test orders) no longer disappear. On Sales channels, Connect lines up with the other rows. Inventory says Not tracked once per row, its search box lines up with the choices beside it, the Google and Apps settings pages no longer jump the menu up, and Payments says Test mode in plain words.",
  links: [{ label: "Orders", tab: "orders" }, { label: "Sales channels", tab: "channels" }, { label: "Inventory", tab: "inventory" }],
} satisfies AppUpdate;
