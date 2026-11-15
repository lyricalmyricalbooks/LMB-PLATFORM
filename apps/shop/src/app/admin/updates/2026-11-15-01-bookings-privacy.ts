import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookings-privacy",
  date: "2026-11-15",
  title: "Privacy requests now cover bookings",
  summary: "When a customer asks for a copy of their data or asks to be forgotten, their bookings and waiting list places are now included. A download lists them. A delete takes the person off waiting lists and clears their name, email, phone, note and answers from bookings; bookings paid by card keep the name and email as a payment record, the same way paid orders do. The time stays on your calendar so you can keep or cancel it.",
  links: [{ label: "Privacy requests", tab: "settings", settingsTab: "general" }, { label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
