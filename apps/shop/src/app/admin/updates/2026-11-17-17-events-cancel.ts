import type { AppUpdate } from "../appUpdates";

export default {
  id: "events-cancel",
  date: "2026-11-17",
  title: "Events and tickets: cancel an event and refund everyone",
  summary: "Events (Beta) can now call a whole event off in one go. Open an event's guest list and press Cancel event: you see how many tickets and how much money are going back, and after you confirm every order is refunded through your own payment account, every guest gets an email saying the event is cancelled, and ticket sales stop. A count shows progress, and if any refund doesn't go through you get those guests by name so you can try them again. You can also cancel without sending money. This was checked with sample data; try one test-mode ticket on your own shop before relying on it.",
  links: [{ label: "Events", tab: "events" }],
} satisfies AppUpdate;
