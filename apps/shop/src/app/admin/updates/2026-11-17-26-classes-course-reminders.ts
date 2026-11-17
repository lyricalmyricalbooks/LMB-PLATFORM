import type { AppUpdate } from "../appUpdates";

export default {
  id: "classes-course-reminders",
  date: "2026-11-17",
  title: "Classes (Beta): reminders for every course date",
  summary: "People on a course now get your reminders before every date, not only the first: the day-before email, the shorter one a few hours ahead if you use it, and the text where texts are on. Each reminder names that date. Your calendar link and each person's own link now show a course on every date it runs, with the stand-in's name on a date someone else takes, and the customer's Add to calendar file holds every date. Not included yet: your linked Google Calendar still shows only the first date, and the thank-you email still goes after the first date. Classes is still Beta, and this has not been tried with real email or text sending.",
  links: [{ label: "Classes", tab: "classes" }, { label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
