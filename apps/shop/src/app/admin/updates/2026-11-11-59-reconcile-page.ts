import type { AppUpdate } from "../appUpdates";

export default {
  id: "reconcile-page",
  date: "2026-11-11",
  title: "Reconcile now lives in the admin",
  summary: "Stockroom › Money › Reconcile is drawn by the admin itself instead of the old inventory app. It shows each card payout that reached your bank with its sales and fees, marks it Matched or with a difference, and counts how many need a look (a refund taken out of a payout, for example). Open a payout to see the orders in it. It reads your shop's own orders, so there is nothing to connect.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
