import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookkeeping-payments",
  date: "2026-11-12",
  title: "Payments in Bookkeeping",
  summary: "Bookkeeping now opens on Payments: what reached your bank in the last 30 days, what's still on its way and which pay links are waiting to be paid. Below are your payouts and every pay-by-QR and invoice link, each with whether it's been paid.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
