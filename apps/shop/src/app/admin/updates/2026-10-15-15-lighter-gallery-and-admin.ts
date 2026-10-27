import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-gallery-and-admin",
  date: "2026-10-15",
  title: "Book pages and the admin download less",
  summary: "Book pages no longer download every gallery photo just to work out its shape, because each photo's size is already saved. The rest of the gallery now loads as soon as a shopper points at, touches or tabs to the photos, so swiping still feels instant. The photo next to the one on screen loads straight away, as before. Wide screens also get a photo copy that matches the frame instead of a larger one. In the admin, the 5-minute check for alerts and badges now pauses while the tab is hidden and catches up when you come back. It also reuses the orders the Orders desk has just loaded, and Discounts and Reviews share that same copy. This needs the next storefront deploy; local tests don't prove live download savings.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
