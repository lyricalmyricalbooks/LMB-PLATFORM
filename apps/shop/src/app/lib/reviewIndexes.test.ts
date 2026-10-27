import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Firestore refuses an average() aggregation over filtered reviews without a composite index that ends on the
// averaged field. Without it every book page's review count/average (reviewsApi.summary) failed with a 400.
describe("review summary index", () => {
  it("firestore.indexes.json covers reviewsApi.summary (bookId == , status == , average(rating))", () => {
    const { indexes } = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));
    const fields = (i: { fields: { fieldPath: string }[] }) => i.fields.map((f) => f.fieldPath).join(",");
    expect(indexes.some((i: any) => i.collectionGroup === "reviews" && fields(i) === "bookId,status,rating")).toBe(true);
  });
});
