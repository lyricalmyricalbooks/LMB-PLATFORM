import type { AppUpdate } from "../appUpdates";

export default {
  id: "service-sales-tax",
  date: "2026-11-17",
  title: "Charge sales tax on a service",
  summary: "Each paid service now has a Charge sales tax switch. When it is on, your shop's own tax rate (from Settings › Taxes) is added on top of the price, and clients see the tax on the booking page before they pay and in their booking email. Deposits, refunds and discount codes all work on the price with tax. In the Tax centre the tax shows on its own line marked Bookings and counts in what you owe, while Bookkeeping counts the visit's takings without the tax. Packs of visits are not taxed yet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
