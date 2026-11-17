import type { AppUpdate } from "../appUpdates";

export default {
  id: "classes-minimum-to-run",
  date: "2026-11-17",
  title: "Classes (Beta): a minimum number to run",
  summary: "A weekly class or a course can now need a minimum number of people. Pick \"Minimum to run\" and when to decide (a day before by default). If too few have signed up by then, the class is cancelled for you: everyone is refunded in full and emailed, you get one email listing who it was, and nobody else can sign up for that time. With enough people it simply runs. Your Book a time page shows the minimum. Classes is still Beta, and this has not been tried against a real payment account.",
  links: [{ label: "Classes", tab: "classes" }],
} satisfies AppUpdate;
