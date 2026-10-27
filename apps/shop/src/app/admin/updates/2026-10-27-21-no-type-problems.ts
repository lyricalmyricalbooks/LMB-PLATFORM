import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-type-problems",
  date: "2026-10-27",
  title: "No known type problems left",
  summary: "Behind the scenes, the last 8 known type problems are fixed, so the code checker now passes on all of the shop and admin code, and any new mistake of that kind stops a change before it reaches the shop. One fix is something a shopper could notice: a screen reader describing the photos of a book with no title no longer says \"undefined\". The rest are safety only, with nothing you would see change.",
  links: [{ label: "Open Catalog", tab: "catalog" }],
} satisfies AppUpdate;
