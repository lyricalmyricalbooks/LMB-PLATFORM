import type { AppUpdate } from "../appUpdates";

export default {
  id: "grill-me-skill",
  date: "2026-10-16",
  title: "A \"grill me\" helper for planning changes",
  summary: "Behind the scenes only: the coding assistant that builds this shop can now be asked to \"grill me\" about a plan before it writes any code. It asks numbered questions, each with a suggested answer, until every decision is settled. Nothing in the shop or the admin changes.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
