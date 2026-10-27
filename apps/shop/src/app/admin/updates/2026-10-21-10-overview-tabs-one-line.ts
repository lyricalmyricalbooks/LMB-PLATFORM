import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-tabs-one-line",
  date: "2026-10-21",
  title: "Overview: topic tabs on one tidy line",
  summary: "The Overview's topic tabs (Today, Sales & money, Titles … Everything) no longer break into two ragged rows on a laptop screen. They stay on one line with a full-width underline; Add widgets and the board menu move just below when there isn't room beside them, and on a narrow window the tabs scroll sideways like they do on a phone. No figures change.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
