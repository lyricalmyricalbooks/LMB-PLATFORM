import type { AppUpdate } from "../appUpdates";

export default {
  id: "part-rows",
  date: "2026-11-18",
  title: "A new product's other parts are short rows",
  summary: "Instead of one More details button that opened everything at once, each optional part of a new product, such as sale price, shipping, categories or search, is now one short row saying what it holds, like Not on sale or Your usual rates. Open a row to change it right where it is. Parts a product doesn't need, such as shipping for a download, have no row. A product's codes and measurements now have their own name, so they no longer share a heading with Product details.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
