import type { AppUpdate } from "../appUpdates";

export default {
  id: "booking-deposits",
  date: "2026-11-15",
  title: "Deposits and paying at the visit",
  summary: "Each service now says when clients pay: the whole price when they book, a deposit now and the rest at the visit, or everything at the visit. A deposit is an amount or a share of the price. Clients see what they pay now and what is left before they book, and their emails say the same. A booking shows the deposit paid and what is still to pay, with one switch to mark the rest paid. Cancelling refunds the deposit, or you can keep it. Bookings is still a beta.",
  links: [{ label: "Calendar", tab: "bookings" }],
} satisfies AppUpdate;
