import type { AppUpdate } from "../appUpdates";

export default {
  id: "customer-sub-tabs",
  date: "2026-10-20",
  title: "One customer's window is split into tabs",
  summary: "Clicking a customer in Customers now opens a shorter window with three tabs: Summary (totals, location, last order, email buttons), Orders (their order history) and Notes & tags (your private note). A note you are typing stays put while you switch tabs, and saving works exactly as before.",
  links: [{ label: "Customers", tab: "customers" }],
} satisfies AppUpdate;
