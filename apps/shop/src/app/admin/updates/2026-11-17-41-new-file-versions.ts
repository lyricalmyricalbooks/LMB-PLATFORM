import type { AppUpdate } from "../appUpdates";

export default {
  id: "new-file-versions",
  date: "2026-11-17",
  title: "Buyer's name on PDFs, new versions of a download, and Tell buyers (Beta)",
  summary: "Open a download product. Turn on \"Print the buyer's name and email on each PDF page\" and each buyer's PDF carries their name, email and order number at the foot of every page, so a shared copy shows whose it was (PDFs up to 50 MB). Beside each file, \"New version\" swaps in a newer upload and keeps its name, and buyers get the new one from the links they already have, with a fresh set of downloads. After you save, \"Tell buyers\" emails everyone who bought it their links again, with a note about what changed. The emails go out a batch at a time over a few minutes. Still Beta, and not yet tried on a test shop.",
  links: [{ label: "Products", tab: "catalog" }],
} satisfies AppUpdate;
