import type { AppUpdate } from "../appUpdates";

export default {
  id: "first-visit-form",
  date: "2026-11-17",
  title: "A form before the first visit (Beta)",
  summary: "You can now ask clients to fill in a form once, like a health or consent form. Write its words and up to five questions, and pick which services ask for it, under Bookings, Hours & rules, Form before the first visit. Clients fill it in on their booking page and sign it with their typed name and a tick; the confirmation and reminder emails ask until they do. You see who signed, when, and their answers on their booking and their client card. If you change the words, everyone is asked again. Signed forms are included when a client asks for their data or to be forgotten. This has not been tried on a live shop yet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
