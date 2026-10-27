import { describe, expect, it } from "vitest";
import { cardCreator } from "./cardCreator";

describe("cardCreator", () => {
  it("shows the Author / contributors credit as typed, else the legacy author name", () => {
    expect(cardCreator({ subtitle: "  Ana  Ruiz & Tom Li " })).toBe("Ana Ruiz & Tom Li");
    expect(cardCreator({ authorName: "Mia Chen" })).toBe("Mia Chen");
    expect(cardCreator({ subtitle: "Various artists", authorName: "Mia Chen" })).toBe("Various artists");
    expect(cardCreator({ subtitle: "   ", authorName: "Mia Chen" })).toBe("Mia Chen");
  });
  it("shows nothing when the book credits nobody", () => {
    expect(cardCreator({})).toBe("");
    expect(cardCreator({ subtitle: 12 })).toBe("");
    expect(cardCreator(null)).toBe("");
  });
  it("cuts a very long credit at a word", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Name${i}`).join(", ");
    const shown = cardCreator({ subtitle: long });
    expect(shown.length).toBeLessThanOrEqual(121);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown).not.toMatch(/,…$/);
  });
});
