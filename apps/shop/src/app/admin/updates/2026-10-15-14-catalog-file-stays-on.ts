import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-file-stays-on",
  date: "2026-10-15",
  title: "Catalog file switches back on by itself",
  summary: "The shop reads its catalog from a file only while nothing has changed since the file was made. Saving a draft book, or a save that changed nothing shoppers see, used to switch the file off until the next code update. Draft books and pages no longer count as changes, and the regular 15-minute site refresh now rebuilds the file whenever it is out of date, so the saving keeps working. Shoppers see exactly the same shop either way. This needs the next Firebase and storefront deploys; local tests don't prove them.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
