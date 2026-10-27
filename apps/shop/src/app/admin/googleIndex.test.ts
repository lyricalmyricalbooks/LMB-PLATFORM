import { describe, expect, it } from "vitest";
import { indexPages, indexStatus, otherCanonical } from "./googleIndex";

describe("Google indexing list", () => {
  it("lists the home page and every public book page, like the sitemap", () => {
    const books = [
      { id: "1", title: "The Hound", slug: "the-hound", status: "published" },
      { id: "2", title: "Draft", slug: "draft", status: "draft" },
      { id: "3", title: "Hidden", slug: "hidden", status: "published", seoNoindex: true },
      { id: "4", title: "Card", slug: "card", status: "published", productType: "giftCard" },
      { id: "5", title: "Later", slug: "later", status: "published", scheduleDate: "2099-01-01" },
    ];
    expect(indexPages(books, "https://lyricalmyricalbooks.com/")).toEqual([
      { id: "_home", title: "Home page", url: "https://lyricalmyricalbooks.com/" },
      { id: "1", title: "The Hound", url: "https://lyricalmyricalbooks.com/books/the-hound" },
    ]);
  });
  it("puts Google's verdict in plain words", () => {
    expect(indexStatus(undefined).label).toBe("Not checked");
    expect(indexStatus({ url: "u", verdict: "PASS" }).tone).toBe("success");
    expect(indexStatus({ url: "u", verdict: "NEUTRAL" }).label).toBe("Not on Google yet");
    expect(indexStatus({ url: "u", verdict: "UNKNOWN", error: true }).label).toBe("Couldn't check");
    expect(otherCanonical({ url: "https://s.com/books/a", verdict: "PASS", googleCanonical: "https://s.com/books/a/" })).toBe("");
    expect(otherCanonical({ url: "https://s.com/books/a", verdict: "PASS", googleCanonical: "https://other.com/a" })).toBe("https://other.com/a");
  });
});
