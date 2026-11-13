import type { AppUpdate } from "../appUpdates";

export default {
  id: "us-shop-fit",
  date: "2026-11-13",
  title: "A shop that sells in US dollars now works like an American shop",
  summary: "A shop set to US dollars is treated as a shop in the United States. Tax settings ask about US sales tax and let you type each state's rate. Shipping starts from a United States zone, labels and tracking default to USPS, and weights are typed in ounces and pounds. Pickup and local delivery accept ZIP codes and states. Bank payments are called a bank transfer, your own address asks for a state and a ZIP code, and checkout starts from the United States. Live carrier prices in another currency are converted before a shopper sees them. A shop that sells in Canadian dollars is unchanged.",
  links: [{ label: "Open Settings", tab: "settings" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
