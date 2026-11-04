import type { AppUpdate } from "../appUpdates";

export default {
  id: "shopper-checkout-fixes-r2",
  date: "2026-11-04",
  title: "Safer extras on e-book orders",
  summary: "A customer whose order holds only e-books can now add more e-books to it from their order page, with no street address needed. Printed items are no longer offered there, because there is no parcel to put them in: before, a printed book added to an e-book order could have been sent with no shipping charged.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
