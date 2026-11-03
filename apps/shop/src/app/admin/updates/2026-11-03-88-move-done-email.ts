import type { AppUpdate } from "../appUpdates";

export default {
  id: "move-done-email",
  date: "2026-11-03",
  title: "An email when your move is done",
  summary: "When the last part of your move from your old shop is ticked on the Overview, you get one email listing everything that came over. If you hide Your move so far while parts are left, one line lets you show it again. And bringing an order file a second time at a new exchange rate now explains that orders already here keep their first rate, and how to change it.",
  links: [
    { label: "Open Overview", tab: "overview" },
    { label: "Open Orders", tab: "orders" },
  ],
} satisfies AppUpdate;
