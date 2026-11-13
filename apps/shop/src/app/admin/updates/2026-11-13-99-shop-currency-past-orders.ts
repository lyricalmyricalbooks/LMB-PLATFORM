import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-currency-past-orders",
  date: "2026-11-13",
  title: "Past orders come over in the shop's own currency",
  summary: "Bring past orders over now works for a shop that sells in US dollars: its old US dollar orders come over as they are, and orders sold in Canadian dollars or another currency are converted into US dollars at a rate you check, with a suggested rate filled in from the Bank of Canada's daily figures. What the old shop charged is still kept beside each converted order. Shops that sell in Canadian dollars work exactly as before.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
