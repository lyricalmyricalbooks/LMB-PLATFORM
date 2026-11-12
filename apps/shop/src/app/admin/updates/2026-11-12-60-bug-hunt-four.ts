import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-hunt-four",
  date: "2026-11-12",
  title: "Invoice card links, free copies and reports made safer",
  summary: "A card link now stops taking money when its invoice is changed, deleted or paid another way, and you are told if a payment still came in on an old link. Invoices paid by card are marked paid before any reminder goes out. A free copy on the till counts as $0. A title with \"test\" inside its name is no longer left out of tax reports. Receipts written with a comma (12,50) are read correctly, and a newsletter to past buyers says why they are getting it.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
