import { describe, expect, it } from "vitest";
import { booksWithoutLink, cleanOwnCodes, linkOk, newCodeProblem, newOwnCode, qrCodeList } from "./qrCodes";

const books = [
  { id: "a", title: "Salt Hours", stripeLink: "https://buy.stripe.com/abc" },
  { id: "b", title: "Night Songs", paymentLink: "https://paypal.me/press/12" },
  { id: "c", title: "Ink Maps" },
  { id: "t", title: "Test", stripeLink: "https://buy.stripe.com/t", isTest: true },
  { id: "d", title: "Bad link", stripeLink: "javascript:alert(1)" },
];

describe("qrCodeList", () => {
  const own = [{ id: "c1", name: "Join the mailing list", url: "https://www.example.com/news" }];
  const list = qrCodeList({ books, siteUrl: "https://shop.example.com", own });
  it("lists the shop, each card payment link, then the owner's own codes", () => {
    expect(list.map((c) => c.name)).toEqual(["Your shop", "Card payment: Salt Hours", "Card payment: Night Songs", "Join the mailing list"]);
    expect(list[1]).toMatchObject({ url: "https://buy.stripe.com/abc", sub: "Opens a card checkout", own: false });
    expect(list[3]).toMatchObject({ sub: "Opens example.com", own: true });
  });
  it("counts items still missing a payment link", () => {
    expect(booksWithoutLink(books)).toBe(2);
  });
  it("leaves the shop out when its address is unknown", () => {
    expect(qrCodeList({ books: [], siteUrl: "", own: [] })).toEqual([]);
  });
});

describe("own codes", () => {
  it("keeps only codes that can print", () => {
    expect(cleanOwnCodes(JSON.stringify([
      { id: "1", name: "Fine", url: "https://example.com/a" },
      { id: "1", name: "Same id", url: "https://example.com/b" },
      { id: "2", name: "", url: "https://example.com" },
      { id: "3", name: "Plain http", url: "http://example.com" },
      "junk",
    ]))).toEqual([{ id: "1", name: "Fine", url: "https://example.com/a" }]);
    expect(cleanOwnCodes("not json")).toEqual([]);
  });
  it("says what is wrong with a new code", () => {
    const own = [{ id: "1", name: "Mailing list", url: "https://example.com" }];
    expect(newCodeProblem("", "", own)).toEqual({ name: "Give the code a name.", url: "Paste the link the code should open." });
    expect(newCodeProblem("mailing list", "https://example.com/x", own)?.name).toMatch(/already/);
    expect(newCodeProblem("Poster", "example.com", own)?.url).toMatch(/https/);
    expect(newCodeProblem("Poster", "https://example.com/p", own)).toBeNull();
    expect(newOwnCode(" Poster ", " https://example.com/p ", 36)).toEqual({ id: "c10", name: "Poster", url: "https://example.com/p" });
  });
  it("accepts only full https links", () => {
    expect(linkOk("https://a.example/x")).toBe(true);
    expect(linkOk("https://localhost")).toBe(false);
    expect(linkOk("mailto:a@b.c")).toBe(false);
  });
});
