import type { AppUpdate } from "../appUpdates";

export default {
  id: "line-sheet",
  date: "2026-10-29",
  title: "Wholesale prices and a printable line sheet",
  summary: "Each product now has a Wholesale price in its Pricing tab: what a shop that resells it pays you. Shoppers never see it. In Products, “Print a line sheet” makes a one-page price list of the selected products (or the ones in view) with photos, codes, retail and wholesale prices, ready to send to a boutique. Products with no wholesale price are named and left off.",
  links: [{ label: "Open products", tab: "catalog" }],
} satisfies AppUpdate;
