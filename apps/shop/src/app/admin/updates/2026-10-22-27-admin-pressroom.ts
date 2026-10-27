import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-pressroom",
  date: "2026-10-22",
  title: "A new look for the whole admin",
  summary: "Every admin page now uses the Pressroom design: a black side menu, a slim top bar, one big title per page, flat white panels with a black rule on top instead of shadowed boxes, figures in one ruled strip, and lighter buttons, chips and alerts. View site, Help and Light/Dark mode are in the menu under your avatar. Nothing about orders, payments or settings works differently.",
  links: [{ label: "Open Overview", tab: "overview" }, { label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
