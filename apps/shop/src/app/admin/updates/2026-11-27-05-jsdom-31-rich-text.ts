import type { AppUpdate } from "../appUpdates";

export default {
  id: "jsdom-31-rich-text",
  date: "2026-11-27",
  title: "Underlined and centred text in rich text boxes is kept",
  summary: "While bringing in a newer version of the tool our automatic checks use, we found that rich text boxes could drop underline or centring when the text was cleaned up. They now keep both.",
  links: [
    { label: "Online store", tab: "design" },
  ],
} satisfies AppUpdate;
