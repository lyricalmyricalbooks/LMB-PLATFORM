import { describe, expect, it } from "vitest";
import { resolveProductRoutes, findProduct } from "./productRoutes";

describe("product destinations", () => {
  const books = [
    { id: "copy", title: "Altrove (Copy)", slug: "altrove", status: "published" },
    { id: "original", title: "Altrove", slug: "altrove", status: "published" },
    { id: "unique", title: "Other", slug: "other", status: "published" },
  ];
  it("gives colliding products independent destinations without mutating catalog data", () => {
    const routed = resolveProductRoutes(books);
    expect(routed.map(b => b.slug)).toEqual(["copy", "original", "other"]);
    expect(findProduct(routed, "original")?.title).toBe("Altrove");
    expect(books[0].slug).toBe("altrove");
  });
  it("resolves an exact ID before another product's slug", () => {
    expect(findProduct([{id:"a",slug:"b"},{id:"b",slug:"c"}], "b")?.id).toBe("b");
  });
  it("resolves duplicate titles by their immutable IDs, preserving drafts", () => {
    expect(findProduct(books, "original")?.id).toBe("original");
    expect(findProduct([{id:"draft",status:"draft",title:"Hidden"}], "draft")).toBeUndefined();
  });
  it("resolves published titles regardless of placeholder words", () => {
    const placeholder = [{ id: "demo", title: "Antigravity Test Book", status: "published" }, { id: "copy", title: "Altrove (Copy)", status: "published" }];
    expect(findProduct(placeholder, "demo")?.id).toBe("demo");
    expect(findProduct(placeholder, "copy")?.id).toBe("copy");
  });
  it("does not let another product's slug shadow an ID or use a blank destination", () => {
    expect(resolveProductRoutes([{id:"a",slug:"b"},{id:"b",title:""}]).map(b=>b.slug)).toEqual(["a", "b"]);
  });
});
