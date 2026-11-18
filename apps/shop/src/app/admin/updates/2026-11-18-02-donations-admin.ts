import type { AppUpdate } from "../appUpdates";

export default {
  id: "donations-admin",
  date: "2026-11-18",
  title: "Donations & tips, part one (Beta)",
  summary: "A new Donations page in your admin lists every gift, who gave and anything they wrote, with this month's total and a refund button. Under Amounts & choices you pick the suggested amounts, whether givers can type their own, cover the card fee or give in someone's honour, and add your own thank-you words. Gifts carry no sales tax. To stop people testing stolen cards, the lowest gift is $5, each visitor and email can open only a few card pages an hour, and bots are turned away; the Blocked tries tile counts what was stopped. The website's Support page comes next. Shows once Donations & tips is offered to your shop and switched on in Settings › General › Ways to sell.",
  links: [{ label: "Ways to sell", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
