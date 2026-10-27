import type { AppUpdate } from "../appUpdates";

export default {
  id: "weekly-highlights-pdf",
  date: "2026-10-18",
  title: "The Monday summary now comes with a PDF of your highlights",
  summary: "Every Monday at 8am the summary email now has a two-page PDF attached: last week's revenue, orders, visits and conversion against the week before, sales and visits by day, best sellers, the most looked-at books, where visitors came from, phones or computers, what shoppers searched for and how many went from looking to buying. Test orders and your own orders are left out, and anything the shop hasn't recorded yet says so instead of showing a zero. Send me last week's summary now sends it with the PDF too. It starts working once the latest Cloud Functions are deployed.",
  links: [{ label: "Shop alerts", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
