import type { AppUpdate } from "../appUpdates";

export default {
  id: "oldest-sort",
  date: "2026-10-13",
  title: "Shop sorting: shoppers can sort by oldest first",
  summary: "The shop's Sort menu now has an Oldest option next to Newest (like Shopify's date, old to new), handy for browsing a back catalogue in the order it was published. You can reword it in Text & labels › Search & filters › Sort: oldest. This only changes the order books are listed in; prices and checkout are unchanged.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=copy" }],
} satisfies AppUpdate;
