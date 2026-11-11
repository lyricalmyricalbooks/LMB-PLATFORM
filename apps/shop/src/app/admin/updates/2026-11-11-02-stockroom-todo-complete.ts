import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-todo-complete",
  date: "2026-11-11",
  title: "The stockroom To-do list shows more, and Home agrees with it",
  summary: "Stockroom › To-do now lists author entries waiting for approval, contributors waiting on their next step, unsent orders (with the orders named under the line) and fairs with takings but no costs. A button that belongs to one book opens that book's page, and Home's stockroom counts come from the same list, so the two always match. Card payments to match and refunds to reverse still live in the old stockroom and are not on this list yet. Nothing here changes any record.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
