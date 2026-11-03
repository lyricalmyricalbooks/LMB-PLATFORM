import { describe, expect, it } from "vitest";
import { FRENCH_COPY } from "./frenchCopy";
import { DEFAULT_COPY } from "./storeCopy";

const tokensOf = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();

describe("French shop words", () => {
  it("has a French word for every English default, and nothing extra", () => {
    expect(Object.keys(FRENCH_COPY).sort()).toEqual(Object.keys(DEFAULT_COPY).sort());
  });

  it("keeps every {token} of the English default", () => {
    const mismatched = Object.keys(DEFAULT_COPY).filter(
      (key) => tokensOf(FRENCH_COPY[key] ?? "").join(",") !== tokensOf(DEFAULT_COPY[key]).join(","),
    );
    expect(mismatched).toEqual([]);
  });

  it("leaves nothing blank or unfinished unless the English is blank", () => {
    const unfinished = Object.keys(DEFAULT_COPY).filter((key) => {
      const french = (FRENCH_COPY[key] ?? "").trim();
      if (DEFAULT_COPY[key] === "") return french !== "";
      return french === "" || french.toUpperCase() === "TODO";
    });
    expect(unfinished).toEqual([]);
  });
});
