import type { AppUpdate } from "../appUpdates";

export default {
  id: "money-boxes-and-setup-retries",
  date: "2026-11-03",
  title: "Amounts you type are read the way you meant them",
  summary: "The Check big orders amount now keeps its decimal point, so 499.99 is saved as 499.99 instead of 49,999. A refund typed with a decimal comma, such as 12,40, is read as $12.40, never $1,240. In Get started, a lost connection can no longer make a second shipping profile, and if your shop opened but the step couldn't be saved, it now says your shop is open.",
  links: [{ label: "Open Settings", tab: "settings" }, { label: "Open the overview", tab: "overview" }],
} satisfies AppUpdate;
