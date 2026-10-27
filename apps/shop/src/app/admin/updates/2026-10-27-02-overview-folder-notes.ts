import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-folder-notes",
  date: "2026-10-27",
  title: "Notes for the Overview folder",
  summary: "The notes that guide future changes now say which Overview files other admin screens also rely on, such as the paid-order and refund rules behind Inventory, Customers and Discounts. A change to the Overview is less likely to quietly shift numbers on those screens. Nothing in the shop or admin changes.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
