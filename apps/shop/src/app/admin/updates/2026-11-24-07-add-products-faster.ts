import type { AppUpdate } from "../appUpdates";

export default {
  id: "add-products-faster",
  date: "2026-11-24",
  title: "Adding products faster: several at once, copies and sizes in one go",
  summary: "Products now has Add several: a short table of photo, name, type, price and stock. Leave a type, price or stock blank to copy the row above. Every row is checked before anything is saved, each becomes a draft, and a row that fails to save stays in the table to try again. Make a copy, from the list or a product's ⋯ menu, keeps everything except photos and stock and opens the copy ready to rename. When a product comes in sizes, Bigger sizes cost more sets every price in one go. After saving a new product you can see it in the shop, add another, make a copy or go back. And Needs attention lists live products with no photo, no weight, nothing in stock or a missing safety fact.",
  links: [{ label: "Products", tab: "catalog" }],
} satisfies AppUpdate;
