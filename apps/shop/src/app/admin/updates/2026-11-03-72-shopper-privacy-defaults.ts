import type { AppUpdate } from "../appUpdates";

export default {
  id: "shopper-privacy-defaults",
  date: "2026-11-03",
  title: "Visitor tracking waits for a yes, and your own address on everything",
  summary: "Your website now counts visits, runs Google Analytics or Clarity, and saves bags for reminder emails only after a shopper says yes on the cookie banner, as European, British and Quebec privacy rules ask. Shoppers can change their answer at any time from the new Cookie settings link at the foot of every page. New shops also start with an empty address, so emails and shipping labels only ever show your own: fill it in under Settings, General, Location. The starter returns wording now keeps shoppers' rights under consumer law, including the 14-day right to cancel in Europe and the UK.",
  links: [{ label: "Open settings", tab: "settings" }],
} satisfies AppUpdate;
