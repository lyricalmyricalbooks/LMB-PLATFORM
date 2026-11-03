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
