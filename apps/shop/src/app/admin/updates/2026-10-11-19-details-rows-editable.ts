import type { AppUpdate } from "../appUpdates";

export default {
  id: "details-rows-editable",
  date: "2026-10-11",
  title: "Every row of a book's Details tab can be edited and reordered",
  summary:
    "Books › edit › Publishing details › Details tab rows now lists every row the book page shows, standard ones included (Edition, Pages, Publisher, Format, Language, Dimensions, ISBN, Weight) and your own. Rename any label, change or add to any value (for example Format: \"Hardcover, raw book board with silk screening\"), hide rows, and move them with the arrows. Rows you added earlier are kept, and books you haven't edited look the same as before.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
