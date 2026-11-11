import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-match-pass-2",
  date: "2026-11-11",
  title: "Closer to the redesign: Reviews, Messages, Settings and Stock",
  summary: "Reviews opens with three tiles (Waiting, Published with your average rating, Hidden) and pill tabs with the same names. Messages has Mark all read at the top and its list in one white card. Settings has a soft menu on the left and pill tabs across the top, and Save now also appears at the top of the page while you have changes. Stock › Inventory is now one table, with Export CSV and Receive stock at the top and the low-stock line under the list; the four figure tiles are gone. Stock › Reorder list is one Reprint suggestions table that marks each book Reprint now or Reprint soon, with the downloads at the top.",
  links: [{ label: "Open Reviews", tab: "reviews" }, { label: "Open Messages", tab: "messages" }, { label: "Open Settings", tab: "settings" }],
} satisfies AppUpdate;
