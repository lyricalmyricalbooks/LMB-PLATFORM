import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-from-message",
  date: "2026-11-18",
  title: "Book a client in straight from their message",
  summary: "When someone asks for a time through your contact form, open their message in Messages and press Make a booking (Beta). Their name, email and phone are filled in, the service they named is picked, and their subject goes in the booking's note. The message is marked read once they're booked.",
  links: [{ label: "Messages", tab: "messages" }],
} satisfies AppUpdate;
