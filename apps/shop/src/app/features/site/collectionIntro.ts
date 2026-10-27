import { getCopy } from "./storeCopy";

/** Text & labels intro for the shop's own collection pages (used when the category has no Navigation description). */
export const COLLECTION_INTRO_KEYS: Record<string, string> = {
  books: "collectionIntroBooks",
  zines: "collectionIntroZines",
  publications: "collectionIntroPublications",
};

/**
 * The short paragraph under a collection page's heading: the category's own description (Studio › Navigation ›
 * Shop categories › Edit), else its Text & labels intro. Blank when neither is set.
 */
export function collectionIntro(design: any, slug: string | undefined, category: any): string {
  const own = category && typeof category === "object" ? String(category.description || "").trim() : "";
  if (own) return own;
  const key = slug ? COLLECTION_INTRO_KEYS[slug] : undefined;
  return key ? getCopy(design, key).trim() : "";
}
