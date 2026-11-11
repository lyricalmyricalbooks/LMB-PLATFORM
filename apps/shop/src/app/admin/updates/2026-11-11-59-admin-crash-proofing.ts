import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-crash-proofing",
  date: "2026-11-11",
  title: "A page that hits a problem no longer takes the admin down",
  summary: "If one admin page hits a problem, the menu stays and the page shows a Try again box instead of a full-screen error, so you can carry on with other pages. After an update, an admin you left open now reloads itself once to pick up the new version instead of failing when you open a page.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
