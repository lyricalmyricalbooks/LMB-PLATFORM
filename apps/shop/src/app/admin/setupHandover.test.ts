import { describe, expect, it } from "vitest";
import { chosenLook, joinParts, keptFile, keptFileLine } from "./setupHandover";

describe("what the press set up before its shop existed (code plan 18.9)", () => {
  it("the chosen look, with the admin look only when it is one the admin has", () => {
    expect(chosenLook({ look: "press-riso" })).toEqual({ theme: "press-riso" });
    expect(chosenLook({ look: "press-riso", adminLook: "neon" } as any)).toEqual({ theme: "press-riso" });
    expect(chosenLook({ look: "" })).toBeNull();
    expect(chosenLook(null)).toBeNull();
  });

  it("a kept file only when its pieces can be read back", () => {
    expect(keptFile({ file: { name: "a.csv", rows: 3, at: "x", parts: 1 } })).toEqual({ name: "a.csv", rows: 3, at: "x", parts: 1 });
    expect(keptFile({ file: { name: " ", rows: -1, at: "x", parts: 2 } })).toEqual({ name: "products.csv", rows: 0, at: "x", parts: 2 });
    expect(keptFile({ file: { name: "a.csv", rows: 3, at: "x", parts: 0 } })).toBeNull();
    expect(keptFile({ file: null })).toBeNull();
    expect(keptFile(null)).toBeNull();
  });

  it("the pieces join back into the file, and a missing piece is refused rather than cutting rows out", () => {
    expect(joinParts(["Title\nA", "\nB\n"])).toBe("Title\nA\nB\n");
    expect(() => joinParts(["Title\nA", undefined])).toThrow();
    expect(() => joinParts([])).toThrow();
  });

  it("the file's line reads plainly, in the shop's words", () => {
    const file = { name: "my zines.csv", rows: 12, at: "2026-11-03T09:00:00.000Z", parts: 1 };
    expect(keptFileLine(file)).toBe("my zines.csv, 12 books, kept on November 3");
    expect(keptFileLine(file, s => s.replace("books", "products"))).toBe("my zines.csv, 12 products, kept on November 3");
    expect(keptFileLine({ ...file, rows: 0, at: "" })).toBe("my zines.csv");
  });
});
