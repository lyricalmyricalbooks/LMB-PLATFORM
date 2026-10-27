import type { AppUpdate } from "../appUpdates";

export default {
  id: "orders-open-on-covers",
  date: "2026-10-18",
  title: "Orders opens on your open orders, newest first",
  summary: "The Orders page now always starts on All orders with the Open tab, newest first, shown as covers, instead of whichever view you used last. The Ship station is one click away with its button, and a link to a single order (such as the one in a new-order email) still opens that order in the Ship station.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
