import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-book-photos",
  date: "2026-10-15",
  title: "Book photos download much less, so the shop costs less to run",
  summary: "Book photos from the 10 October catalog import were sent to every visitor as the full original file (300 KB to 1 MB each, about 4 MB per homepage visit). After this update is deployed, a background job makes the same small WebP copies newer uploads get and adds them to those books by itself, without deleting or replacing any original. Shop cards, the bag, checkout and search then load a copy sized for the screen, which should cut a homepage visit to roughly 0.3 to 0.5 MB of pictures. Pictures also tell browsers to keep them for a year, so returning visitors don't download them again. New uploads make lighter card-sized copies, and removing a photo or video from a book (or deleting the book) now deletes its files too, unless another book or an order still shows them.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
