import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-visitor-change-words",
  date: "2026-10-22",
  title: "Overview: visitor lines in What changed read in plain words",
  summary: "Today › What changed used to say \"Conversion improved to 2.5%\" with \"1.0% of visitors bought in the 30 days before\" underneath. It now says \"2.5% of visitors bought, up from 1.0%\", then the paid orders and visitors behind each figure (\"3 paid orders from 120 visitors now; 1 from 100 in the 30 days before\"). The visitors line reads the same way: \"Visitors rose by 20%\", \"120 visitors now, 100 in the 30 days before\". Same figures as before, only the wording changed.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
