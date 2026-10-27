import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-rules",
  date: "2026-10-25",
  title: "Pre-order rules are now written once for the shop and checkout",
  summary: "What counts as a pre-order, when a parcel can ship and what the order emails say about it used to be kept in two copies, one for the shop pages and one for the server, that had to be changed together. There is now one copy that both use, so the book page, the bag and the charged order can't drift apart. Nothing changes for shoppers. Takes effect once the server update is deployed.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
