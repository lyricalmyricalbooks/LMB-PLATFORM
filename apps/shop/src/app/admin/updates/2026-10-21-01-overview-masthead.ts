import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-masthead",
  date: "2026-10-21",
  title: "Overview header finished to the Masthead design",
  summary: "The top of the Overview now shows revenue, orders, visitors and conversion in one strip under the dates, each with its change against the comparison period. The updated time sits to the right of the title, the comparison is a quiet \"vs\" picker, and the long dates sentence and the \"Saved to your account\" note are gone (a save problem still shows).",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
