import type { AppUpdate } from "../appUpdates";

export default {
  id: "earlier-times",
  date: "2026-11-17",
  title: "Tell me if an earlier time opens (Beta)",
  summary: "Clients with a one-to-one booking can tick \"Tell me if an earlier time opens\" on their booking page. When someone cancels or moves, the time that opened goes to the first client who asked and whose booking is later: it is held for them for 30 minutes, and they get an email (and a text, when you send texts) with one button that moves their booking to it. If they do nothing, they keep their booking and the time passes to the next person. Their old time then opens for others. You see \"Wants an earlier time\" on their booking. Classes and courses are not included. This has not been tried on a live shop yet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
