import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-link-page-gone",
  date: "2026-11-15",
  title: "No more inventory app link page",
  summary: "Your stockroom lives inside this admin now, so the old page for linking a separate inventory app is gone from Inventory, along with the alerts that sent you there. Website sales still come off your stockroom count by themselves, and the website still shows what the stockroom says. To check one product, open it and look at its Stock and sales tab.",
  links: [{ label: "Inventory", tab: "inventory" }, { label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
