import type { AppUpdate } from "../appUpdates";

export default {
  id: "customers-all-orders", date: "2026-10-10", title: "Customers: full history, net spend and a country filter",
  summary: "The Customers page now reads every order instead of only the latest 500, so repeat buyers and lifetime value are no longer understated on a busy shop. Total spent, average order and VIP/at-risk segments now take partial refunds off, matching the Overview. A new country filter next to the search box narrows the list (and the CSV export) to one country. Admin-only; nothing changes for shoppers and no deployment is needed beyond the frontend.",
  links: [{ label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
