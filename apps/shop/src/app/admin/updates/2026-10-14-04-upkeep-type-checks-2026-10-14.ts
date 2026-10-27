import type { AppUpdate } from "../appUpdates";

export default {
  id: "upkeep-type-checks-2026-10-14",
  date: "2026-10-14",
  title: "Behind-the-scenes code checks tightened",
  summary: "Routine upkeep, with nothing that looks or works differently. The automatic code checks now cover the tab rows on the book editor, Discounts and Shipping settings screens, the book's Search (SEO) preview, shipping zones and the Custom code feature. That leaves 15 known type warnings instead of 22, so a future mistake in those places is caught before it reaches the shop.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
