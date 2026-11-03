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
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });

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
