import type { AppUpdate } from "../appUpdates";

export default {
  id: "rules-check-ci",
  date: "2026-10-25",
  title: "Database safety rules are now tested on every change",
  summary: "Before any change reaches the shop, its database safety rules are now checked against Google's real rules engine: guests can still place orders, sign up and leave reviews, and can't read or change what they shouldn't. Nothing changes on screen; a mistake in those rules is now caught before it goes live.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
