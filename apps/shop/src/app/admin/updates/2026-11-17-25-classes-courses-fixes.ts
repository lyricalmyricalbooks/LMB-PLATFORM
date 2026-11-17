import type { AppUpdate } from "../appUpdates";

export default {
  id: "classes-courses-fixes",
  date: "2026-11-17",
  title: "Classes (Beta): three course fixes",
  summary: "Three fixes to courses found in review. Your Classes page now updates on its own when someone joins or leaves a course, in every week the course runs, not only its first. When a different person takes one date of a course because the usual one is busy, that date now shows the right name. And your Timetable page no longer risks showing places left on a full course when a shop runs a very large number of course dates at once. Classes is still Beta, and this has not been tried against a real payment account.",
  links: [{ label: "Classes", tab: "classes" }],
} satisfies AppUpdate;
