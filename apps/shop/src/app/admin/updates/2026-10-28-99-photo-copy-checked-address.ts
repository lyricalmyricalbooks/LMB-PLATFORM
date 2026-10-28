import type { AppUpdate } from "../appUpdates";

export default {
  id: "photo-copy-checked-address",
  date: "2026-10-28",
  title: "Safer copying of photos from your old shop",
  summary: "When your shop copies book photos over from your old shop's web address, it now checks where that address leads once and then downloads from exactly that place. Before, a badly-meant address could point somewhere safe during the check and somewhere private a moment later. Nothing changes in how you import books; this is a safety repair behind the scenes.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
