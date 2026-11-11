import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-social",
  date: "2026-11-11",
  title: "Social posts and Sales channels, simpler",
  summary: "Both Marketing pages now match the redesign. Sales channels is one list of every place you sell, each with where it stands and a Connect button or a menu for posting, sending your products and disconnecting. Social posts is one table of every post, the ones that need you first, with New post by the title and Cancel or Try again in each post's menu.",
  links: [{ label: "Open Social posts", tab: "socialPosts" }, { label: "Open Sales channels", tab: "channels" }],
} satisfies AppUpdate;
