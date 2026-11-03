import { describe, expect, it } from "vitest";
import { SELLS_CHOICES } from "./WhatYouSellCard";
import { currentSells } from "./sells";

describe("What you sell setting", () => {
  it("offers the mixed type and books first", () => {
    expect(SELLS_CHOICES[0].id).toBe("books");
    expect(SELLS_CHOICES.some((c) => c.id === "mixed")).toBe(true);
  });
  it("reads the owner's later answer before sign-up's", () => {
    expect(currentSells({ publishes: "books", sells: "clothing" } as never)).toBe("clothing");
  });
});

import { stockroomWordsNote } from "./WhatYouSellCard";
import { sizeGuideStarter } from "./sizeGuideStarters";

describe("the stockroom caught-up note", () => {
  it("says nothing for a shop that never changed its answer", () => {
    expect(stockroomWordsNote("clothing", null, false)).toBe("");
    expect(stockroomWordsNote(null, "clothing", true)).toBe("");
  });
  it("says the stockroom switches next time it opens, then that it is using the words", () => {
    expect(stockroomWordsNote("clothing", "books", false)).toMatch(/next time you open it/);
    expect(stockroomWordsNote("clothing", null, true)).toMatch(/next time you open it/);
    expect(stockroomWordsNote("clothing", "clothing", false)).toBe("Your stockroom is using these words.");
  });
});

describe("starter size guides", () => {
  it("exist for clothing and shoes only", () => {
    expect(sizeGuideStarter("clothing")).toMatch(/Chest/);
    expect(sizeGuideStarter("shoes")).toMatch(/Foot length/);
    for (const k of ["book", "jewelry", "art", "music", "other", undefined]) expect(sizeGuideStarter(k)).toBe("");
  });
});
