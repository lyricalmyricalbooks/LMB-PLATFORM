import type { AppUpdate } from "../appUpdates";

export default {
  id: "trade-pricing",
  date: "2026-10-29",
  title: "Wholesale prices for boutiques (groundwork)",
  summary: "The shop can now charge your private wholesale price to an approved boutique. A signed-in, verified person whose email is on your trade list gets the wholesale price on their order, and the price is worked out on the server so nobody can type their own. Paying is by card only for now. The trade list screen and the wholesale prices in the bag come next, so nothing changes for shoppers yet.",
  links: [{ label: "Open products", tab: "catalog" }],
} satisfies AppUpdate;
