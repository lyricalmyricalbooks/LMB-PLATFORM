import type { AppUpdate } from "../appUpdates";

export default {
  id: "first-rows",
  date: "2026-11-04",
  title: "See the top of a file before bringing it in",
  summary: "Every window that brings in a single file now has First rows of the file under the file name: open it to check the right file and sheet came in. When matching columns in Books import, each choice shows that column's first value.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
