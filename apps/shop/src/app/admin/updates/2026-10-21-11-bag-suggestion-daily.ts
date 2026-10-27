import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-suggestion-daily",
  date: "2026-10-21",
  title: "Bag suggestion: long titles fit, and a new book each day",
  summary: "The “Complete your collection” card in the shopping bag no longer hides long titles (like SISTEMA_NON_AUTORIZZATO) under its Add to bag button: the title now breaks onto up to three lines, after its underscores where it can, on computers and phones. The card also changes book every day (Toronto time), going through the books that can be bought right now; every shopper sees the same book that day, and books from the same category as the bag still come first. Scheduled books that aren't out yet are never suggested. Its look and words are still in Studio › Theme settings › Cart drawer (shopping bag) and Text & labels › Cart.",
  links: [{ label: "Edit the bag in Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
