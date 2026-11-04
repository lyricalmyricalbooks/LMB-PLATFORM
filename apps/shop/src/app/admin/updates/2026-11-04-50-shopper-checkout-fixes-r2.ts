import type { AppUpdate } from "../appUpdates";

export default {
  id: "shopper-checkout-fixes-r2",
  date: "2026-11-04",
  title: "Clearer order pages and fairer codes",
  summary: "A customer whose order holds only e-books can now add more e-books to it from their order page, with no street address needed. Printed items are no longer offered there, because there is no parcel to put them in: before, a printed book added to an e-book order could have been sent with no shipping charged. Order pages and the account's order history now show the gift card that paid part of an order, so the lines add up to the total. A code limited to email domains now works at checkout however you typed the domain (“.edu”, “school.ca” or “@school.ca”); before, “@school.ca” turned away the very customers it was for.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Discounts", tab: "discounts" }],
} satisfies AppUpdate;
