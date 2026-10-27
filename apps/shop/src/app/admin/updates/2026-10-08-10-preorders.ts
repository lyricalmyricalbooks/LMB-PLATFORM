import type { AppUpdate } from "../appUpdates";

export default {
  id: "preorders", date: "2026-10-08", title: "Take pre-orders for upcoming books",
  summary: "Turn on Pre-order in Books › edit › Inventory and set the publication date. Shoppers see a Pre-order button, badge and release date on the book page, bag, checkout and order tracking; the book becomes a normal one on release day. Paid pre-orders wait in Orders › Pre-orders until release (or press Ready to ship now), pre-ordered e-books unlock on release day, and order emails explain the timing. Every label is editable in Studio. Deploy Functions with this release so checkout, emails and downloads follow the pre-order rules.",
  links: [{ label: "Set up a pre-order in Books", tab: "catalog" }, { label: "See waiting pre-orders", tab: "orders" }, { label: "Edit pre-order words in Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
