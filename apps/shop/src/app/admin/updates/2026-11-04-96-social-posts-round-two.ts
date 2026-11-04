import type { AppUpdate } from "../appUpdates";

export default {
  id: "social-posts-round-two",
  date: "2026-11-04",
  title: "Square post pictures, a failed-post email and social sales on the Overview",
  summary: "Posts now use a square picture of the whole photo, so covers aren't cropped and Instagram always accepts them. If a scheduled post doesn't go out, you get an email saying where and why (Settings, Notifications, Shop alerts can turn it off). The Overview has a new Social media that sells card: visits, orders and sales from each network and from shared links.",
  links: [
    { label: "Open Social posts", tab: "socialPosts" },
    { label: "Open Overview", tab: "overview" },
  ],
} satisfies AppUpdate;
