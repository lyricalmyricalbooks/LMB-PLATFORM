import { describe, expect, it } from "vitest";
import { tillItems, tilePhoto } from "./till";

describe("item photo at the till", () => {
  it("uses the catalogue's cover when it is a safe address", () => {
    const items = tillItems({ books: [{ id: "a", title: "A", coverUrl: "https://example.com/a.jpg" }, { id: "b", title: "B" }] as any, states: {}, taxCenter: null });
    expect(items.map((i) => i.photo)).toEqual(["https://example.com/a.jpg", ""]);
  });
  it("refuses anything that isn't https or a kept picture", () => {
    expect(tilePhoto("http://example.com/a.jpg")).toBe("");
    expect(tilePhoto("javascript:alert(1)")).toBe("");
    expect(tilePhoto("data:text/html;base64,AAAA")).toBe("");
    expect(tilePhoto("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
});
