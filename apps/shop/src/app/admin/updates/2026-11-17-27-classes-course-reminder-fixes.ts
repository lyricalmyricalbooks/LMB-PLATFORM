import type { AppUpdate } from "../appUpdates";

export default {
  id: "classes-course-reminder-fixes",
  date: "2026-11-17",
  title: "Classes (Beta): two fixes to course reminders and calendars",
  summary: "Someone who signs up for a course right before one of its dates no longer gets a reminder for that date straight after their confirmation. And when a different person takes one date of a course, that date now shows in their own calendar link instead of the usual person's. Classes is still Beta.",
  links: [{ label: "Classes", tab: "classes" }],
} satisfies AppUpdate;
