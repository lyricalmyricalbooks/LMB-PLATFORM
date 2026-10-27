// Tab reminder: the tab title while a shopper with books in the bag is on another tab (see tabReminder.ts). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "cart-tab-reminder",
  style: {
    group: "cartDrawer", subsection: "Total & checkout button", subsectionAfter: "cartDrawerShowDeliveryNote", after: "cartDrawerEmptyPicksCount",
    fields: [
      { key: "cartTabReminder", label: "Tab reminder: when a shopper with books in the bag switches to another browser tab, the shop’s tab title reminds them (words: Text & labels › Cart)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Cart", after: "cartEmptyPicksAddAria",
    fields: [
      { key: "cartTabReminder", label: "Tab reminder · Tab title", default: "({count}) Your books are waiting", hint: "Shown as the browser tab title while a shopper with books in the bag is on another tab, when Style › Cart drawer › Tab reminder is on. Use {count} for how many books are in the bag." },
    ],
  },
} satisfies StorefrontFeature;
