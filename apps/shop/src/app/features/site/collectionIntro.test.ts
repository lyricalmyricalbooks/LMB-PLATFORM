import { describe, expect, it } from "vitest";
import { collectionIntro, COLLECTION_INTRO_KEYS } from "./collectionIntro";
import { DEFAULT_COPY } from "./storeCopy";

describe("collectionIntro", () => {
  it("gives the shop's own collections a short intro by default", () => {
    for (const [slug, key] of Object.entries(COLLECTION_INTRO_KEYS)) {
      expect(DEFAULT_COPY[key], key).toBeTruthy();
      const intro = collectionIntro({}, slug, { name: slug });
      expect(intro).toContain("Lyricalmyrical Books");
      expect(intro.split(/[.!?](\s|$)/).filter(s => s.trim().length > 1).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("prefers the category's own description, and respects a cleared Text & labels intro", () => {
    expect(collectionIntro({}, "books", { name: "Books", description: " Our books. " })).toBe("Our books.");
    expect(collectionIntro({ copy: { collectionIntroBooks: "Edited." } }, "books", { name: "Books" })).toBe("Edited.");
    expect(collectionIntro({ copy: { collectionIntroBooks: "" } }, "books", { name: "Books" })).toBe("");
    expect(collectionIntro({}, "other", { name: "Other" })).toBe("");
    expect(collectionIntro({}, "books", "ALL")).toContain("Photobooks");
  });
});
