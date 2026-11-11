import type { AppUpdate } from "../appUpdates";

export default {
  id: "record-a-sale-page",
  date: "2026-11-11",
  title: "Record a sale now lives in the admin",
  summary: "Stockroom › Sales › Record a sale is drawn by the admin itself instead of the old inventory app, so the old book selector and its pop-ups are gone. Pick the book, copies, price, channel and date, then Save sale. It saves the same way as Record a sale on Sales records, refuses more copies than you have on hand, and clears the form for the next sale.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
