import type { AppUpdate } from "../appUpdates";

export default {
  id: "checked-gift-card-actions",
  date: "2026-10-26",
  title: "Gift card changes are checked on both ends",
  summary: "Issuing a gift card, changing its balance or expiry, turning it on or off and resending it now use one shared description of what each request contains, in the admin and on the server. A request that doesn't match is turned away before the card is touched. Nothing changes in how you manage gift cards. Takes effect once the server update is deployed.",
  links: [{ label: "Open Gift cards", tab: "giftCards" }],
} satisfies AppUpdate;
