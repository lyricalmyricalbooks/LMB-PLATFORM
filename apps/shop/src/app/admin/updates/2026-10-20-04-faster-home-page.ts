import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-home-page",
  date: "2026-10-20",
  title: "The shop's home and category pages do less work on phones",
  summary: "The first download of the shop is about 12% smaller: the shopping bag's code now loads next to the page instead of inside it, and two small helpers no longer drag the book-listing and shipping code along. The page also stops re-reading its saved shop data many times while it starts, and skips style work for page parts you haven't styled. In local tests on a slowed-down phone this cut the time the screen is busy while loading. Nothing looks or works differently.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
