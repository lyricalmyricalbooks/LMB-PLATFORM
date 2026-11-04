import type { AppUpdate } from "../appUpdates";

export default {
  id: "past-order-rate",
  date: "2026-11-03",
  title: "Change the rate on one brought-over order",
  summary: "An order your old shop sold in another currency, such as US dollars, now shows on its own page what it sold for and the rate it came over at. Press Change the rate to correct that one order, for example to match your bank statement. Only its Canadian-dollar amounts change, and the change is noted on the order.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
