// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getPublicSettings: vi.fn(async () => ({ design: { categories: [{ id: "p", name: "Poetry" }] } })),
  createBook: vi.fn(async (b: any) => ({ id: "new1", ...b })),
  updateBook: vi.fn(async (id: string, b: any) => ({ id, ...b })),
}));
vi.mock("./inventoryLinkApi", () => ({ inventoryLinkApi: { links: async () => ({}) } }));
vi.mock("./api", () => ({ adminApi: api }));
const oldShop = vi.hoisted(() => ({ readOldShopAddress: vi.fn(async (_address: string) => ({
  host: "moth.example", notes: ["Stock counts aren't shown publicly, so check how many you have of each before you open."],
  csv: "Handle,Title,Variant Price,Image Src,Old page address\nmoth-songs,Moth Songs,20,https://img.example/m.jpg,/product/moth-songs\n",
})) }));
vi.mock("./oldShopApi", () => oldShop);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { BookImportDialog } = await import("./BookImportDialog");
const { setImageLoader } = await import("./photoLinks");
setImageLoader(async (url) => !url.includes("gone"));

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); localStorage.clear(); });

const books = [{ id: "b1", title: "Salt Hours", isbn: "9780306406157", retailPrice: 24, stockLevel: 7, status: "published" }];
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };

describe("BookImportDialog", () => {
  it("previews a file, imports only good rows and hands back the new drafts", async () => {
    const onDone = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(BookImportDialog, { books, onClose: () => {}, onDone })));

    const csv = "ISBN,Title,Price,Stock\n9780306406157,,26,7\n,New Moon,15,\n,Bad,abc,\n";
    const file = new File([csv], "books.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();

    const text = document.body.textContent || "";
    expect(text).toContain("1 new");
    expect(text).toContain("1 to update");
    expect(text).toContain("1 with problems");
    expect(text).toMatch(/Price: 24 → 26/);

    const importBtn = [...document.querySelectorAll("button")].find(b => /Import 2 books/.test(b.textContent || ""))!;
    await act(async () => { importBtn.click(); });
    await flush();

    expect(api.updateBook).toHaveBeenCalledWith("b1", { title: "Salt Hours", retailPrice: 26 }, books[0]);
    expect(api.createBook).toHaveBeenCalledWith(expect.objectContaining({ title: "New Moon", retailPrice: 15, status: "draft" }));
    expect(onDone).toHaveBeenCalledWith(["new1"]);
    expect(document.body.textContent).toContain("2 of 2 saved");
  });

  it("lets the owner match columns it doesn't know (plan 23.36)", async () => {
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(BookImportDialog, { books, onClose: () => {}, onDone: () => {} })));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["Book,Cost to buyer\nNew Poems,22.50\n"], "list.csv")], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(document.body.textContent).toContain("0 of 2 matched");
    // Each choice shows the column's first value, and the top of the file can be unfolded (plan 23.39).
    expect(document.body.textContent).toContain("e.g. 22.50");
    const glance = document.querySelector("details.rp-first-rows")!;
    expect(glance.querySelector("summary")!.textContent).toBe("First rows of the file");
    expect([...glance.querySelectorAll("th")].map(t => t.textContent)).toEqual(["Book", "Cost to buyer"]);
    expect([...glance.querySelectorAll("td")].map(t => t.textContent)).toEqual(["New Poems", "22.50"]);
    expect(document.body.textContent).toContain("Nothing can be imported");
    const pick = async (label: string, value: string) => {
      const select = [...document.querySelectorAll("select")].find(s => s.closest("label, div")?.textContent?.startsWith(label))!;
      await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await flush();
    };
    await pick("Book", "title");
    // A field already matched isn't offered for another column.
    const other = [...document.querySelectorAll("select")].find(s => s.closest("label, div")?.textContent?.startsWith("Cost to buyer"))!;
    expect([...other.options].map(o => o.value)).not.toContain("title");
    await pick("Cost to buyer", "retailPrice");
    const text = document.body.textContent || "";
    expect(text).toContain("2 of 2 matched");
    expect(text).toContain("1 new");
    expect([...document.querySelectorAll("button")].some(b => /Import 1 book/.test(b.textContent || ""))).toBe(true);
  });

  it("matches the same columns again in the next import (plan 23.41)", async () => {
    const open = async () => {
      act(() => root?.unmount());
      document.body.innerHTML = "";
      const host = document.createElement("div"); document.body.append(host);
      root = createRoot(host);
      act(() => root!.render(h(BookImportDialog, { books, onClose: () => {}, onDone: () => {} })));
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [new File(["Book,Cost to buyer,Notes\nNew Poems,22.50,signed\n"], "list.csv")], configurable: true });
      await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
      await flush();
    };
    const select = (label: string) => [...document.querySelectorAll("select")].find(s => s.closest("label, div")?.textContent?.startsWith(label))!;
    const pick = async (label: string, value: string) => {
      const s = select(label);
      await act(async () => { s.value = value; s.dispatchEvent(new Event("change", { bubbles: true })); });
      await flush();
    };
    await open();
    expect(document.body.textContent).toContain("0 of 3 matched");
    await pick("Book", "title");
    await pick("Cost to buyer", "retailPrice");
    // Nothing is remembered until the books are imported.
    expect(localStorage.length).toBe(0);
    const importBtn = [...document.querySelectorAll("button")].find(b => /Import 1 book/.test(b.textContent || ""))!;
    await act(async () => { importBtn.click(); });
    await flush();

    await open();
    let text = document.body.textContent || "";
    expect(text).toContain("2 of 3 matched, as last time");
    expect(select("Book").value).toBe("title");
    expect(select("Cost to buyer").value).toBe("retailPrice");
    expect(select("Notes").value).toBe("");
    expect(text).toContain("1 new");
    // Changing a match drops the "as last time" note.
    await pick("Book", "");
    text = document.body.textContent || "";
    expect(text).toContain("1 of 3 matched");
    expect(text).not.toContain("as last time");
  });

  it("offers the workbook's other sheets and reads the one chosen (plan 23.37)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(BookImportDialog, { books, onClose: () => {}, onDone: () => {} })));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bytes = readFileSync(join(__dirname, "testdata", "spreadsheets", "sheets.xlsx"));
    Object.defineProperty(input, "files", { value: [new File([bytes], "sheets.xlsx")], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    const sheetSelect = async () => {
      for (let i = 0; i < 50; i++) {
        const found = [...document.querySelectorAll("select")].find(s => [...s.options].some(o => o.text === "Sheet: Summary"));
        if (found && !document.body.textContent?.includes("Loading")) return found;
        await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      }
      throw new Error(document.body.textContent || "no select");
    };
    const sheet = await sheetSelect();
    expect(sheet.value).toBe("Books");
    expect([...sheet.options].map(o => o.text)).toEqual(["Sheet: Cover", "Sheet: Books", "Sheet: Summary"]);
    expect(document.body.textContent).toContain("1 unchanged"); // Salt Hours, already in the shop
    await act(async () => { sheet.value = "Summary"; sheet.dispatchEvent(new Event("change", { bubbles: true })); });
    for (let i = 0; i < 50 && !document.body.textContent?.includes("no book rows"); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect((await sheetSelect()).value).toBe("Summary");
    expect(document.body.textContent).toContain("The file has no book rows"); // the Summary sheet is one line
  });

  it("reads an old shop's address into the same preview (plan 23.11)", async () => {
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(BookImportDialog, { books, onClose: () => {}, onDone: () => {} })));
    const field = document.querySelector('input[placeholder="yourshop.com"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(field, " moth.example "); field.dispatchEvent(new Event("input", { bubbles: true })); });
    const button = [...document.querySelectorAll("button")].find(b => /Bring my books over/.test(b.textContent || ""))!;
    await act(async () => { button.click(); });
    await flush();
    expect(oldShop.readOldShopAddress).toHaveBeenCalledWith("moth.example");
    const text = document.body.textContent || "";
    expect(text).toContain("moth.example products.csv");
    expect(text).toContain("1 new");
    expect(text).toContain("Stock counts aren't shown publicly");
    expect(text).toMatch(/Links to these books on your old shop/);
  });

  it("shows the server's plain words when the address can't be read", async () => {
    oldShop.readOldShopAddress.mockRejectedValueOnce(new Error("We couldn't read the products at that address."));
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(BookImportDialog, { books, onClose: () => {}, onDone: () => {} })));
    const field = document.querySelector('input[placeholder="yourshop.com"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(field, "nowhere.example"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { [...document.querySelectorAll("button")].find(b => /Bring my books over/.test(b.textContent || ""))!.click(); });
    await flush();
    expect(document.body.textContent).toContain("We couldn't read the products at that address.");
    expect(document.body.textContent).not.toContain("1 new");
  });

  it("leaves photos that can't be loaded out of the saved books (plan 23.3)", async () => {
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(BookImportDialog, { books: [], onClose: () => {}, onDone: () => {} })));
    const csv = "Handle,Title,Variant Price,Image Src\nmoth,Moth,20,https://img.example/fine.jpg\nmoth,,,https://img.example/gone.jpg\n";
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File([csv], "old.csv", { type: "text/csv" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(document.body.textContent).toContain("1 photo couldn't be loaded from the old shop");
    await act(async () => { [...document.querySelectorAll("button")].find(b => /Import 1 book/.test(b.textContent || ""))!.click(); });
    await flush();
    expect(api.createBook.mock.calls[0][0].photos.map((p: any) => p.url)).toEqual(["https://img.example/fine.jpg"]);
  });
});
