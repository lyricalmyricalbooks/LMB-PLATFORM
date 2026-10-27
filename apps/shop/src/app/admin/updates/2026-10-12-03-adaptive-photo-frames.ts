import type { AppUpdate } from "../appUpdates";

export default {
  id: "adaptive-photo-frames",
  date: "2026-10-12",
  title: "Book page photos can fit landscape and portrait shots",
  summary:
    "Book pages can now size each photo's frame to suit it, so an open-book spread shows wide and a cover shot stays upright. In Studio › Theme settings › Product page · photos › Photos, choose Frame size (adapt to each photo): “Smart” gives upright photos your Photo shape, near-square photos a square frame and wide photos the Shape for landscape photos (3:2 unless you pick another); “Match each photo exactly” uses every photo's own proportions, so nothing is cropped. The default stays “Same shape for every photo”, so your shop looks the same until you change it.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
