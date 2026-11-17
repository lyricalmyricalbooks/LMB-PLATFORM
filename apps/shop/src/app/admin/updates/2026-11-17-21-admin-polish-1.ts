import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-polish-1",
  date: "2026-11-17",
  title: "Admin polish: money, switches and phone tiles",
  summary: "Bookings and Events now write amounts with the same CA$ or US$ sign as the rest of the admin. Switches such as Show test orders are round pills everywhere, not only in Settings. On phones the last figure tile on Orders and Events fills the row, and a long amount shrinks to fit its tile.",
  links: [{ label: "Events", tab: "events" }, { label: "Orders", tab: "orders" }],
} satisfies AppUpdate;
