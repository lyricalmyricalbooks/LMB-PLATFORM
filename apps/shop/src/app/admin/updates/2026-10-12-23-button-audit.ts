import type { AppUpdate } from "../appUpdates";

export default {
  id: "button-audit",
  date: "2026-10-12",
  title: "Over 150 buttons fixed across the shop, admin and Design studio",
  summary:
    "A full audit of every button. Checkout: pressing Enter in a text box no longer starts a payment, a discount code that couldn't be checked no longer says it is invalid, and a PayPal- or manual-only shop starts with a usable payment method. Shop: Add to bag can't add twice, Add both asks for an edition, Remove in the bag has Undo, failed actions now say so, the phone menu closes when you tap outside and has the light/dark switch, and empty section buttons no longer jump to the top. Admin: bulk order actions only act on the orders you can see, archived orders can be put back in the work queues, refund/decline/resolve/ready-to-ship buttons ask first and can't run twice, test labels can't be marked shipped, stock edits on the Books page go through the checked stock path, and failed loads show Try again instead of looking empty. Design studio: toast Undo only undoes the change it names, saved themes are never silently dropped at the limit, footer Add link keeps the automatic links, and many smaller fixes.",
  links: [
    { label: "Orders", tab: "orders" },
    { label: "Open the Design studio", tab: "settings", settingsTab: "designer" },
  ],
} satisfies AppUpdate;
