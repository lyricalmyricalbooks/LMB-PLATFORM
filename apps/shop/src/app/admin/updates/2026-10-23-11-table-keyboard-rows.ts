import type { AppUpdate } from "../appUpdates";

export default {
  id: "table-keyboard-rows",
  date: "2026-10-23",
  title: "Open any list row from the keyboard",
  summary:
    "In Orders, Books and the other admin lists where clicking a row opens it, you can now press Tab to move to a row and Enter or Space to open it, with a clear outline showing which row you are on. Clicking works exactly as before. Only the admin changes; the public shop is untouched.",
  links: [
    { label: "Orders", tab: "orders" },
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
