import type { AppUpdate } from "../appUpdates";

export default {
  id: "square-memberships",
  date: "2026-11-18",
  title: "Memberships and monthly gifts work with Square (Beta)",
  summary: "Shops that take payments with Square on the monthly plan can now sell memberships and take monthly gifts. Members join on Square's own page, and you can cancel, pause or skip a month for them as before. On pay as you sell, Square can't take repeating payments, so the Members page says so plainly. Square shops connected before today need to connect Square again once so it allows repeating payments.",
  links: [{ label: "Members", tab: "memberships" }],
} satisfies AppUpdate;
