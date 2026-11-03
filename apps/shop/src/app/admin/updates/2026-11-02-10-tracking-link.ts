import type { AppUpdate } from "../appUpdates";

export default {
  id: "tracking-link",
  date: "2026-11-02",
  title: "Copy a private tracking link for any order",
  summary: "Open an order and press Copy tracking link. Paste it into an email or message and that customer can see their own order's progress, with nothing to type in. Each link works only for its own order.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
