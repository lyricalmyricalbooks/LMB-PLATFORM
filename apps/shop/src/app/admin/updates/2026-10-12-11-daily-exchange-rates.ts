import type { AppUpdate } from "../appUpdates";

export default {
  id: "daily-exchange-rates",
  date: "2026-10-12",
  title: "USD and EUR prices follow each day's exchange rate",
  summary:
    "The shop now saves the day's Canadian-dollar exchange rates by itself every few hours. USD and EUR prices on the shop and the amount charged at checkout both use that same saved copy, so what shoppers see is what they pay. A shop page left open picks up new rates within about an hour without reloading. If the rate service is down, the shop keeps the last good day's rates instead of old fixed numbers, and an answer that looks wrong is never used. Your CAD prices never change. Needs the updated Functions deployed with the storefront.",
  links: [{ label: "Open Payments settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
