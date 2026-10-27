import { expect, test } from "vitest";
import { catalogPublishIssues } from "./catalogPublishReview";
const complete = { title: "Book", subtitle: "Confirmed Photographer", photos: [{ url: "https://example.com/cover.jpg" }, { url: "https://example.com/interior.jpg" }], description: "Publisher copy", retailPrice: 25, format: "Paperback", edition: "First printing", pageCount: 48, weight: "300g" };
test("reviews real catalog fields without inventing facts", () => { expect(catalogPublishIssues(complete)).toEqual([]); expect(catalogPublishIssues({ title: "test" }).map(issue => issue.key)).toEqual(expect.arrayContaining(["photos", "credits", "price", "edition", "weight", "description", "placeholder"])); });
test("blocks invalid base, sale and variant prices while free orders require review", () => { for (const patch of [{ retailPrice: null }, { retailPrice: -1 }, { retailPrice: NaN }, { isOnSale: true, salePrice: "" }, { variants: [{ price: -2 }] }]) expect(catalogPublishIssues({ ...complete, ...patch }).some(issue => issue.key === "price" && issue.blocking)).toBe(true); expect(catalogPublishIssues({ ...complete, retailPrice: 0 }).find(issue => issue.key === "free")?.blocking).toBe(false); });
test("weight required for physical editions but not digital-only books", () => { expect(catalogPublishIssues({ ...complete, weight: "" }).some(issue => issue.key === "weight")).toBe(true); expect(catalogPublishIssues({ ...complete, format: "E-book", weight: "" }).some(issue => issue.key === "weight")).toBe(false); });
test("copy words prompt editorial review without changing the record", () => { const book = { ...complete, title: "The Copy Shop", status: "published" }; expect(catalogPublishIssues(book).some(issue => issue.key === "placeholder")).toBe(true); expect(book.status).toBe("published"); });
test("audiobooks and digital editions need no weight; edition weights count", () => {
  const weightFlag = (book: any) => catalogPublishIssues(book).some(issue => issue.key === "weight");
  expect(weightFlag({ ...complete, format: "Audiobook", weight: "" })).toBe(false);
  expect(weightFlag({ ...complete, format: "EPUB", weight: "" })).toBe(false);
  expect(weightFlag({ ...complete, weight: "", variants: [{ id: "p", name: "Paperback", price: 20, weight: "250g" }, { id: "e", name: "E-book (EPUB)", price: 9 }] })).toBe(false);
  expect(weightFlag({ ...complete, weight: "", variants: [{ id: "p", name: "Paperback", price: 20 }] })).toBe(true);
});

test("reviews gift cards and box sets for what applies to them", () => {
  const keys = (b: any) => catalogPublishIssues(b).map((i) => i.key);
  const giftCard = { title: "Gift card", productType: "giftCard", description: "Give a book lover the choice.", photos: [{ url: "https://x/y.jpg" }], variants: [{ id: "25", name: "CA$25", price: 25, digital: true }] };
  expect(keys(giftCard)).not.toEqual(expect.arrayContaining(["credits"]));
  expect(keys(giftCard)).not.toContain("edition");
  expect(keys(giftCard)).not.toContain("weight");
  expect(keys(giftCard)).not.toContain("interior");
  expect(keys({ ...giftCard, variants: [] })).toContain("giftcard-amounts");
  const boxSet = { title: "Trilogy", description: "Three books.", retailPrice: 60, bundleItems: [{ bookId: "a", quantity: 1 }] };
  expect(keys(boxSet)).not.toContain("weight");
  expect(keys(boxSet)).not.toContain("edition");
});
