import type { AppUpdate } from "../appUpdates";

export default {
  id: "order-book-shapes",
  date: "2026-10-27",
  title: "Overview figures handle incomplete orders",
  summary: "The Overview now knows the shape of an order and a book, which showed a few places where an order missing its date or total could be counted oddly. Those places now treat a missing date as unknown and a missing total as zero, exactly as they did in practice, and future changes to the Overview get checked against the same shapes.",
  links: [{ label: "Open the overview", tab: "overview" }],
} satisfies AppUpdate;
