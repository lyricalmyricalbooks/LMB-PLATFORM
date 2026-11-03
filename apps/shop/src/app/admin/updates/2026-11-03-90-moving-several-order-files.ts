import type { AppUpdate } from "../appUpdates";

export default {
  id: "moving-several-order-files",
  date: "2026-11-03",
  title: "Bring several order files at once",
  summary: "If your old shop gives you one order file per year or per month, choose them all in Bring past orders over, or press Add another file. They come over together, each order once, and one Take this import back removes them all. When your move is done, the Overview's You're all moved in now says how many customers, gift cards and past orders came over.",
  links: [
    { label: "Open Orders", tab: "orders" },
    { label: "Open Overview", tab: "overview" },
  ],
} satisfies AppUpdate;
