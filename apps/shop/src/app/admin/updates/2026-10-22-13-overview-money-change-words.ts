import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-money-change-words",
  date: "2026-10-22",
  title: "Overview: revenue, discount and refund lines in What changed read in plain words",
  summary: "Today › What changed used to say \"Revenue up 100% on the 30 days before\" with \"CA$320.00 vs CA$160.00\" underneath. It now says \"Revenue rose by 100%\", then \"CA$320.00 now, CA$160.00 in the 30 days before, mostly from more orders (9 orders now, 4 before)\", like the book, country and visitor lines. The discount line now reads \"Discounts took 18% off list price, up from 0%\" with the amounts for both periods, and the refund line compares with the period before. Same figures as before, only the wording changed.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
