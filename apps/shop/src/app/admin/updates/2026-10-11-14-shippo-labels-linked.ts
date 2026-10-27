import type { AppUpdate } from "../appUpdates";

export default {
  id: "shippo-labels-linked",
  date: "2026-10-11",
  title: "Shippo labels now show their order in Shippo",
  summary:
    "Labels bought from Orders used to appear in Shippo with an empty Order column, so Shippo's own dashboard couldn't manage or refund them. Each label is now bought together with a Shippo order carrying the website's order number. If Shippo won't create that order, the label is still bought as before. To refund a label that was already bought, open the order and press \"Wrong label? Replace it\", which voids it with Shippo for a refund.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
