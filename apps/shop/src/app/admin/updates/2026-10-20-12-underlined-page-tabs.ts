import type { AppUpdate } from "../appUpdates";

export default {
  id: "underlined-page-tabs",
  date: "2026-10-20",
  title: "Page tabs are now a plain underlined row",
  summary: "The tabs that split a page into sections (Overview topics, Settings › General and Payments, Shipping, Email sender, Inventory, a customer's details and the book editor) are now a plain row with a line under the open one. Filter rows, like order or review status, keep their boxed look, so the two are easy to tell apart.",
  links: [
    { label: "Overview", tab: "overview" },
    { label: "General", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
