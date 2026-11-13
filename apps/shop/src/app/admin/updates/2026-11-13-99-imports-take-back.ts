import type { AppUpdate } from "../appUpdates";

export default {
  id: "imports-take-back",
  date: "2026-11-13",
  title: "Take a product import back",
  summary: "After you import a spreadsheet of products, the window now offers Take this import back. It deletes the drafts that import added and puts updated products back as they were, and it leaves alone anything you have published or edited since, stock counts, orders and customers. The offer stays in the import window on this browser for 14 days. Big files also save several products at a time, so they finish sooner, and the activity log shows one line per import in place of one per product.",
  links: [{ label: "Open Products", tab: "catalog" }],
} satisfies AppUpdate;
