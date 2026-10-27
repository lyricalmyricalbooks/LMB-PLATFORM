import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-analytics-google",
  date: "2026-10-13",
  title: "Overview: Google Analytics, any date range, profit, titles and cohorts",
  summary: "The Overview is rebuilt for deeper analytics. Pick any period (this month, last month, this year, 12 months or your own dates) and compare it with the period before or the same days last year. The main chart switches between net revenue, orders, books sold, average order, visitors and conversion, grouped by day, week or month, with totals and the best day. A new “What changed” list explains the biggest moves (which titles climbed or slowed, which country moved, traffic and conversion, discounts and refunds). New figures show gross profit and margin (from the cost prices in Inventory) and this month's pace. Dig deeper adds a Titles tab (every book's sales, change, views, profit and stock, downloadable), busiest hours, shipping speed and payment methods, and customer cohorts (who comes back and how soon). Google Analytics 4 can now be connected in Settings › General › Google Analytics: the shop then sends visits, book views, bag adds, checkouts and purchases to Google (never for visitors who decline analytics cookies, the design preview or you as admin), and the Overview shows Google's visitors, channels, sources, landing pages, countries, devices, engagement and people on the site right now. Marketing & traffic › “Start traffic counts again” clears the shop's own pre-launch test counts (orders and revenue are never touched). These need the updated Cloud Functions to be deployed.",
  links: [
    { label: "Open the Overview", tab: "overview" },
    { label: "Connect Google Analytics", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
