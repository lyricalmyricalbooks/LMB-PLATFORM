import type { AppUpdate } from "../appUpdates";

export default {
  id: "sharper-book-photos", date: "2026-10-15", title: "Book photos are saved even sharper",
  summary: "Photos you upload in Books › edit › Photos are now saved up to 3200 px wide (was 2400) at a higher quality, so covers and fine type stay crisp on retina screens and in the full-screen photo viewer. Shop cards and phones still load a small copy, so pages don't get slower. Your original file is also kept, untouched, for later. Photos uploaded before today keep their old copies: upload a cover again if you want it at the new quality.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
