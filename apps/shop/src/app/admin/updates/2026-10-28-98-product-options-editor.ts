import type { AppUpdate } from "../appUpdates";

export default {
  id: "product-options-editor",
  date: "2026-10-28",
  title: "Sell in sizes and colours",
  summary: "The Editions tab of the product editor has a new Options card. Type an option such as Size with its choices (S, M, L) and another such as Colour, then press Make the editions: every combination becomes an edition with its own price, stock and photo, and shoppers pick with buttons on the product page. Editions you already had keep their price and stock when their name is one of the choices. A book with plain editions doesn't need this and works as before.",
  links: [{ label: "Open your books", tab: "catalog" }],
} satisfies AppUpdate;
