import type { AppUpdate } from "../appUpdates";

export default {
  id: "add-another",
  date: "2026-11-18",
  title: "Saved, now add the next one",
  summary: "When you create a product, the page says it's saved and offers Add another, which starts the next one with the same type, maker, price, sizes and shipping. A product with colours also offers Add it in a new colour, which copies the words, facts and sizes and leaves out the colour, the photos and the web address.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
