import type { AppUpdate } from "../appUpdates";

export default {
  id: "analytics-that-help",
  date: "2026-10-18",
  title: "More useful shop analytics, without your own visits",
  summary: "The Overview now shows, book by book, how often each title goes into the bag and flags books that are looked at but not bagged, or bagged but not bought (Dig deeper › Titles). Marketing & traffic adds where checkout loses people step by step, which campaigns and ?ref= links bring sales and new customers, the pages that start sales, real page speed from shoppers' phones and computers, and Google searches once Search Console is connected (Settings › General › Google Search Console). Customers shows whether the cart reminder emails worked and newsletter sign-ups per week; Stock lists books people want but can't buy. A Monday summary email of last week's sales goes to the shop (Settings › Email sender › Shop alerts). Your own browsing is never counted: every browser where you sign in to the admin is left out automatically, and Settings › General › Your own visits has a link for your phone. Orders you place with the shop's own email stay in Orders but are left out of the figures. The new counts start from today; visits counted before can't be taken back.",
  links: [
    { label: "Open the Overview", tab: "overview" },
    { label: "Your own visits", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
