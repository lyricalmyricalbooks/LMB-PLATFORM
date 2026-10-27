import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-file-shipping-checkout",
  date: "2026-10-20",
  title: "Book pages and checkout read less from the database",
  summary: "This change lowers running costs. Nothing looks different to you or to shoppers. The catalog file the website keeps on its own hosting now also holds your shipping profiles. Book pages, the bag's shipping estimate and checkout use that file while nothing has changed since it was made. Checkout used to read the whole catalog from the database every time it opened, the thank-you page too. It now checks one small record instead. When you save a book, a page, the shop settings or a shipping profile, the shop reads the database again until the site is rebuilt, which happens by itself within about 15 minutes. Payments are still priced by the server. Checkout still asks the shopper to confirm if the total changed. This takes effect once the new server code and website are deployed.",
  links: [{ label: "Shipping settings", tab: "settings", settingsTab: "shipping" }, { label: "Orders", tab: "orders" }],
} satisfies AppUpdate;
