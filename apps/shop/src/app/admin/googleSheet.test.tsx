// @vitest-environment jsdom
// Bring a Google Sheet in by its link (plan 23.42): a pretend Google link stands in; nothing reaches Google.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({
  status: { enabled: true, connected: true, accountEmail: "owner@example.com", extrasOffered: ["drive"], extrasChosen: [] as string[] } as any,
  readSheet: vi.fn(async (args: any): Promise<any> => ({
    available: true, title: "Old shop list", sheet: args.sheet ?? "Books", sheets: ["Books", "Poems"],
    rows: args.sheet === "Poems" ? [["Title", "Price"], ["Second Moon", "12"], ["Third", "9"]] : [["Title", "Cost to buyer"], ["New Moon", "$15.00"]],
  })),
  connectLink: vi.fn(async (_extras: string[]) => "https://accounts.google.example/allow"),
}));
vi.mock("./googleConnect", () => ({
  useGoogleConnect: () => ({ mode: "platform", status: google.status, error: null, reload: () => {} }),
  googleConnectApi: { readSheet: google.readSheet, connectLink: google.connectLink },
}));
vi.mock("./inventoryLinkApi", () => ({ inventoryLinkApi: { links: async () => ({}) } }));
vi.mock("./api", () => ({ adminApi: { getPublicSettings: async () => ({}), createBook: vi.fn(), updateBook: vi.fn() } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { parseSheetLink, openGoogleSheet } = await import("./googleSheet");
const { readSpreadsheet } = await import("./spreadsheetFile");
const { BookImportDialog } = await import("./BookImportDialog");

const LINK = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=7";
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); });
const settle = async (until: () => boolean) => {
  for (let i = 0; i < 60 && !until(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
};
const button = (name: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === name)!;
const type = async (input: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
};

describe("Google Sheet links (plan 23.42)", () => {
  it("reads the id and tab from the links Google gives out, and nothing else", () => {
    expect(parseSheetLink(LINK)).toEqual({ spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", gid: 7 });
    expect(parseSheetLink("docs.google.com/spreadsheets/u/1/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toEqual({ spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" });
    for (const bad of ["", "https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", "https://docs.google.com/spreadsheets/d/short"]) {
      expect(parseSheetLink(bad)).toBeNull();
    }
  });

  it("stands in for a file: its other tabs are read again from Google", async () => {
    const file = await openGoogleSheet(LINK);
    if (file === "allow") throw new Error("expected a file");
    expect(file.name).toBe("Old shop list");
    expect(google.readSheet).toHaveBeenCalledWith({ spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", gid: 7 });
    const read = await readSpreadsheet(file);
    expect({ ...read, text: read.text.trim().split(/\r?\n/) }).toEqual({ text: ["Title,Cost to buyer", "New Moon,$15.00"], sheet: "Books", sheets: ["Books", "Poems"] });
    expect(google.readSheet).toHaveBeenCalledTimes(1);
    expect((await readSpreadsheet(file, "Poems")).text).toContain("Second Moon");
    expect(google.readSheet).toHaveBeenLastCalledWith({ spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", sheet: "Poems" });
  });

  it("brings a sheet into Books import like a chosen file", async () => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(BookImportDialog, { books: [], onClose: () => {}, onDone: () => {} })));
    await act(async () => { button("Google Sheet").click(); });
    const input = document.querySelector('input[type="url"]') as HTMLInputElement;
    await type(input, "https://example.com/not-a-sheet");
    await act(async () => { button("Bring in").click(); });
    expect(document.body.textContent).toContain("Paste the link of a Google Sheet");
    expect(google.readSheet).not.toHaveBeenCalled();
    await type(input, LINK);
    await act(async () => { button("Bring in").click(); });
    await settle(() => !!document.body.textContent?.includes("Match columns"));
    const text = document.body.textContent || "";
    expect(text).toContain("Old shop list");
    expect(text).toContain("e.g. $15.00");
    expect(document.querySelector('input[type="url"]')).toBeNull();
    const tabs = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text === "Sheet: Poems"))!;
    await act(async () => { tabs.value = "Poems"; tabs.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle(() => !!document.body.textContent?.includes("2 new"));
    expect(document.body.textContent).toContain("2 new");
  });

  it("asks Google once for reading when the shop linked before it was offered, keeping what is on", async () => {
    google.readSheet.mockResolvedValueOnce({ available: false });
    google.status = { ...google.status, extrasChosen: ["youtube"] };
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, href: window.location.href });
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(BookImportDialog, { books: [], onClose: () => {}, onDone: () => {} })));
    await act(async () => { button("Google Sheet").click(); });
    await type(document.querySelector('input[type="url"]') as HTMLInputElement, LINK);
    await act(async () => { button("Bring in").click(); });
    await settle(() => !!document.body.textContent?.includes("Allow with Google"));
    expect(document.body.textContent).toContain("owner@example.com");
    await act(async () => { button("Allow with Google").click(); });
    await settle(() => assign.mock.calls.length > 0);
    expect(google.connectLink).toHaveBeenCalledWith(["youtube", "drive"]);
    expect(assign).toHaveBeenCalledWith("https://accounts.google.example/allow");
    // Back from Google, the link is still there to bring in.
    expect(sessionStorage.getItem("colophon.pendingSheetLink")).toBe(LINK);
    vi.unstubAllGlobals();
  });
});
