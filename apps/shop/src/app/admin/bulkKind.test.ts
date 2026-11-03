import { describe, it, expect } from "vitest";
import { planKindChange, withKind, isProductKind } from "./bulkKind";

describe("bulk kind change", () => {
  it("book to clothing stores the kind and drops the book format", () => {
    const next = withKind({ id: "a", title: "T", format: "Paperback" }, "clothing");
    expect(next.kind).toBe("clothing");
    expect(next.format).toBe("");
  });
  it("clothing back to book removes the kind and restores a format", () => {
    const next = withKind({ id: "a", kind: "clothing", format: "" }, "book");
    expect("kind" in next).toBe(false);
    expect(next.format).toBe("Paperback");
  });
  it("book to e-book keeps the format and never touches other fields", () => {
    const book = { id: "a", title: "T", format: "Hardcover", price: 12 };
    expect(withKind(book, "ebook")).toEqual({ ...book, kind: "ebook" });
  });
  it("clothing to shoes keeps what was there", () => {
    expect(withKind({ id: "a", kind: "clothing", material: "cotton" }, "shoes")).toEqual({ id: "a", kind: "shoes", material: "cotton" });
  });
  it("skips products that already are that kind and counts them", () => {
    const plan = planKindChange([{ id: "1" }, { id: "2", kind: "clothing" }, { id: "3", kind: "garbage" }], "clothing");
    expect(plan.already).toBe(1);
    expect(plan.changes.map(c => c.book.id)).toEqual(["1", "3"]);
  });
  it("does not change the originals", () => {
    const b = { id: "1", format: "Paperback" };
    planKindChange([b], "art");
    expect(b).toEqual({ id: "1", format: "Paperback" });
  });
  it("knows the kinds", () => { expect(isProductKind("shoes")).toBe(true); expect(isProductKind("x")).toBe(false); });
});
