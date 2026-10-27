import type { AppUpdate } from "../appUpdates";

export default {
  id: "ship-station-orders",
  date: "2026-10-18",
  title: "Orders is now a Ship station, with an All orders page of covers",
  summary: "Orders opens on the Ship station. It shows how many orders are left to ship, the labels bought today and how long the oldest order has waited, with a numbered queue of what to do next. The open order shows its three steps (address, pack, label) as a strip. Step 3 now holds the parcel size, the label rates and the Buy label button right on the page, with the service the customer paid for picked first; they used to be two pop-ups. Buying a label still never marks the order shipped or emails the customer. All orders shows every order as a cover card, under Open, Completed and All orders, and the Table view with bulk actions and CSV export is still one click away.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
