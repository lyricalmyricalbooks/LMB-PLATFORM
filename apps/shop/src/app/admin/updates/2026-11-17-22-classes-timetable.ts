import type { AppUpdate } from "../appUpdates";

export default {
  id: "classes-timetable",
  date: "2026-11-17",
  title: "Classes (Beta): a timetable page in the admin",
  summary: "The first step of Classes is built: a Classes page with your week's timetable, how full each class is, the list of who is in it with check-in on the day, and the classes you run. Classes uses the same engine as Bookings, so places, waiting lists, packs of visits, deposits and reminders work the same way, and switching Classes on brings the Bookings page with it. It can't be switched on for a shop yet: that comes with the Timetable page for your website, the next step. Not yet tried against a real payment account.",
  links: [{ label: "Classes", tab: "classes" }],
} satisfies AppUpdate;
