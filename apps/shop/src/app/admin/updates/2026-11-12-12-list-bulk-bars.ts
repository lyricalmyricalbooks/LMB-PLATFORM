import type { AppUpdate } from "../appUpdates";

export default {
  id: "list-bulk-bars",
  date: "2026-11-12",
  title: "Orders and products: tick several, act once",
  summary: "The order list and the products list have a tick box on each row and one at the top. Tick some and a bar appears. On Orders, Mark packed packs every ticked order that is ready to pack and says which it skipped. On products, Set as draft takes the ticked ones off the shop until you publish them again.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open products", tab: "catalog" }],
} satisfies AppUpdate;
