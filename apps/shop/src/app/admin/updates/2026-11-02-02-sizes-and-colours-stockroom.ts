import type { AppUpdate } from "../appUpdates";

export default {
  id: "sizes-and-colours-stockroom",
  date: "2026-11-02",
  title: "Add every size and colour in one go in the stockroom",
  summary: "If you sell something other than books, the stockroom's Add new product form has Sizes and Colours boxes. Type S, M, L and Black, White and it makes one item for each combination, each with its own stock count and low-stock alert. Shops that sell books don't see the new boxes.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
