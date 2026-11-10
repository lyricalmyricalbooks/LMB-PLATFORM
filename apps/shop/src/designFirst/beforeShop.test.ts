import { describe, expect, it, vi } from "vitest";
import { beforeShopBackend, designLook, designerReturn, designerUrl, sampleShopBooks } from "./beforeShop";
import { ThemeConflictError } from "../app/admin/themeStore";

describe("designing before the store exists", () => {
  it("saves every draft and publish to the press's setup record, with its look", async () => {
    const save = vi.fn(async (_id: string, change: any) => ({ pressId: "p1", design: change.design } as any));
    const store = beforeShopBackend({ save } as any, "p1", { a: 1 });
    expect((await store.open(null)).draft).toEqual({ a: 1 });
    const rev = await store.write(0, { a: 2, themeBase: { id: "folio" } });
    expect(rev).toBe(1);
    expect(save).toHaveBeenLastCalledWith("p1", { design: { a: 2, themeBase: { id: "folio" } }, look: "folio" });
    await expect(store.write(0, { a: 3 })).rejects.toBeInstanceOf(ThemeConflictError);
    await expect(store.saveThemes([], [{ id: "x" }])).rejects.toThrow(/comes with your store/);
    await store.fieldUpdate({ b: 1 });
    expect(store.current()).toEqual({ a: 2, themeBase: { id: "folio" }, b: 1 });
  });

  it("names the look only for a sensible id, and links both ways with the press id escaped", () => {
    expect(designLook({ themeBase: { id: "kiln" } })).toBe("kiln");
    expect(designLook({ themeBase: { id: "<x>" } })).toBe("");
    expect(designerUrl("a b")).toBe("/design/studio?press=a%20b");
    expect(designerReturn("a&b")).toBe("/join/?press=a%26b&designed=1");
  });

  it("gives sample products that are never real", () => {
    const books = sampleShopBooks("books");
    expect(books.length).toBeGreaterThan(0);
    expect(books.every(b => b.id.startsWith("sample-") && b.photos[0].url.startsWith("data:image/svg+xml"))).toBe(true);
  });
});
