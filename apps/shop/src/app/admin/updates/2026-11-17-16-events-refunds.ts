import type { AppUpdate } from "../appUpdates";

export default {
  id: "events-refunds",
  date: "2026-11-17",
  title: "Events and tickets: refund an order from the guest list",
  summary: "Events (Beta) can now give tickets back. In an event's guest list, press Refund on an order, tick the tickets (all of them or just some) and you see the exact amount before you confirm. The money goes back to the card they paid with through your own payment account, the buyer gets an email, their tickets stop working and the places go back on sale. You can also cancel tickets without sending money. A ticket already checked in at the door can't be refunded until you undo its check-in. This was checked with sample data; try one test-mode ticket on your own shop before relying on it.",
  links: [{ label: "Events", tab: "events" }],
} satisfies AppUpdate;
