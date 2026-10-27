import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-drill-downs",
  date: "2026-10-18",
  title: "Open any Overview figure to see what's behind it",
  summary: "Rows marked ▸ on the Overview now open. Abandoned carts list each cart: the shopper's email and name, the books and editions, the bag's value, when it was left, whether a reminder went out and whether they came back (with a link to their order), plus which books are left in bags most. Sales figures (best sellers, formats, countries, categories, weekdays, discounts, gift cards, refunds, payment methods, time to ship, codes) open to their orders, and you can switch to the books those orders sold. Traffic and searches open to a day-by-day count, campaigns, sources and landing pages to their orders, and back-in-stock requests to the readers waiting.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
