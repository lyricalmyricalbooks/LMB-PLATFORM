import type { AppUpdate } from "../appUpdates";

export default {
  id: "events-admin",
  date: "2026-11-17",
  title: "Events and tickets: the first half is built",
  summary: "The first of the six new ways to sell is taking shape. The admin now has an Events page, marked Beta, where a shop adds an event, sets its tickets and prices, and sees who is coming with a code for each ticket. Tickets are held for ten minutes while someone pays, so the last place is never sold twice, and the ticket email goes out in English or French. Nothing changes in your shop yet: the page appears once the events page on your website is ready and Events is opened for your shop.",
  links: [{ label: "Settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
