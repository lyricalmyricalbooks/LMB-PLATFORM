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
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { BookImportDialog } = await import("./BookImportDialog");

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
});
