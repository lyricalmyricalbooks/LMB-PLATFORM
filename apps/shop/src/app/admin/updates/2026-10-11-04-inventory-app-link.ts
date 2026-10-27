import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-app-link", date: "2026-10-11", title: "Website sales now reach the inventory app, and stock follows it",
  summary: "The website and the inventory app can now share sales and stock. Each paid website order (and later refunds and shipping updates) is sent to the inventory app, which adds it to its books. Orders you already entered there by hand are linked, not counted twice. The inventory app's count (printings, market sales, consignment, damaged copies) then sets the website's stock for every book you match, at most 15 minutes behind; website sales still take copies off straight away. Postage bought in the inventory app for a website order is accepted too: once you mark it shipped there, the website dispatches the order and emails the customer, after the same safety checks as Orders › Dispatch. The old \"Copy stock from the old shop\" button is gone, because it copied counts frozen since the inventory app's move. Setting up takes a one-time permission in Google Cloud and an update of the inventory app; nothing is shared until you finish the steps in Inventory › Inventory app link.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
