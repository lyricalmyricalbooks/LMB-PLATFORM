import type { AppUpdate } from "../appUpdates";

export default {
  id: "move-moved-in",
  date: "2026-11-03",
  title: "You're all moved in",
  summary: "When every part of your move from your old shop is done, the Overview now says so, with a last reminder to check your old links. The email that follows lists how many customers, gift cards and past orders came over. If a move sits untouched for a week, you get one gentle reminder of what is left. Orders brought over again at a new exchange rate can now take that rate with one button. Bring past orders over is now on the main Orders page, and Check your old links opens the right Settings tab.",
  links: [
    { label: "Open Overview", tab: "overview" },
    { label: "Open Orders", tab: "orders" },
  ],
} satisfies AppUpdate;
