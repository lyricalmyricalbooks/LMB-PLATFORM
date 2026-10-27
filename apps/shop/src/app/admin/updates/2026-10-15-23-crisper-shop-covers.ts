import type { AppUpdate } from "../appUpdates";

export default {
  id: "crisper-shop-covers",
  date: "2026-10-15",
  title: "Book covers in the shop grid look crisp again",
  summary: "Shop cards were asking the browser for a photo sized for a four-across grid, but the shop shows three across on computers and two on phones, and a wide photo cropped into a square card is drawn even larger. Browsers picked a copy that was too small and stretched it, so covers looked soft. Every book grid (shop, category pages, Product grid sections, Featured collection, related books, wishlist, recently viewed) now asks for the copy its real column count and photo crop need, so no cover is enlarged on any screen we measured. New photo uploads also save their small copies at a higher quality so printed grain stays visible; photos already uploaded keep their current copies.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
