import { describe, expect, it } from "vitest";
import { cardFormats } from "./cardFormats";

describe("cardFormats", () => {
  it("lists a book's editions' formats in filter order", () => {
    expect(cardFormats({ variants: [{ format: "E-book" }, { format: "Paperback" }] })).toEqual(["paperback", "ebook"]);
    expect(cardFormats({ variants: [{ name: "Hardcover" }, { name: "Audiobook" }, { name: "Paperback" }] })).toEqual(["paperback", "hardcover", "audiobook"]);
  });
  it("shows nothing for one format, none, or only unnamed extras", () => {
    expect(cardFormats({ format: "Paperback" })).toEqual([]);
    expect(cardFormats({ variants: [{ format: "Paperback" }, { format: "Paperback" }] })).toEqual([]);
    expect(cardFormats({ variants: [{ format: "Paperback" }, { name: "Signed copy" }] })).toEqual([]);
    expect(cardFormats({})).toEqual([]);
    expect(cardFormats(null)).toEqual([]);
  });
});
