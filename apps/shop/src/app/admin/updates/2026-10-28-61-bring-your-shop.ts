import type { AppUpdate } from "../appUpdates";

export default {
  id: "bring-your-shop",
  date: "2026-10-28",
  title: "Bring your shop with you",
  summary: "Books › Import CSV now takes the product export from your old shop exactly as it comes out. Books, photos, prices, sale prices, stock and editions such as signed copies come over as new drafts, and you see every book before anything is saved. Customers › Bring customers over turns your old customer list into private notes and tags. Customers who agreed to marketing email can also join your newsletter, but only after you confirm you have their permission. Bringing the same file over twice changes nothing. Photos still load from your old shop's address for now, so keep it open until they have been copied over.",
  links: [
    { label: "Import books", tab: "catalog" },
    { label: "Bring customers over", tab: "customers" },
  ],
} satisfies AppUpdate;
