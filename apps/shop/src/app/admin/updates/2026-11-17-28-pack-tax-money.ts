import type { AppUpdate } from "../appUpdates";

export default {
  id: "pack-tax-money",
  date: "2026-11-17",
  title: "Bookings (Beta): packs of visits charge tax and count in your money pages",
  summary: "A pack of visits for a service that charges sales tax now charges it too, on top of the pack's price, and the booking page says \"plus tax\" beside it. The pack's email and your Packs list show the tax by name, and you can still give back everything paid when you close one. Packs now count as sales in the Tax centre, Bookkeeping and Reports on the day they were paid, less anything you gave back, with their tax on its own line. The visits booked with a pack carry no price, so nothing is counted twice. Packs sold before today stay untaxed. This has not been tried with a real card payment yet.",
  links: [{ label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
