import type { AppUpdate } from "../appUpdates";

export default {
  id: "template-buttons-check-starters",
  date: "2026-11-27",
  title: "Button check works with the starter websites again",
  summary: "Maintenance: the automatic check that every website look follows your button outline and shadow settings stopped on the starter websites, because they now hide the second sign-up box on the shop page. The check turns that box back on while it tests the button, so it covers every look again. Nothing changes on your website.",
  links: [
    { label: "Online store", tab: "design" },
  ],
} satisfies AppUpdate;
