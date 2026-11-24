import { describe, expect, it } from "vitest";
import { attentionReasons } from "./needsAttention";
import { stockInfo } from "./catalogList";

const fine = { title: "Mug", typeId: "ceramics", photos: [{ url: "p" }], weight: "400", trackInventory: true, stockLevel: 5, status: "published" };
const why = (b: any, live = true) => attentionReasons(b, stockInfo(b), live);

describe("Needs attention", () => {
  it("lists nothing for a finished product, or for one that isn't live", () => {
    expect(why(fine)).toEqual([]);
    expect(why({ title: "Draft" }, false)).toEqual([]);
  });
  it("names a missing photo, weight and stock", () => {
    expect(why({ ...fine, photos: [], weight: "", stockLevel: 0 })).toEqual(["No photo", "No weight", "Sold out"]);
  });
  it("doesn't ask a download or a backorder for weight or stock", () => {
    expect(why({ ...fine, digital: true, weight: "" })).toEqual([]);
    expect(why({ ...fine, stockLevel: 0, allowBackorder: true })).toEqual([]);
  });
  it("counts every size's weight, falling back to the product's", () => {
    expect(why({ ...fine, weight: "", variants: [{ id: "a", weight: "200", stock: 2 }, { id: "b", stock: 1 }] })).toEqual(["No weight"]);
    expect(why({ ...fine, variants: [{ id: "a", stock: 2 }] })).toEqual([]);
  });
  it("names a fact the law asks for that is blank", () => {
    expect(why({ ...fine, typeId: "home-scents" })).toContain("No ingredients");
  });
});
