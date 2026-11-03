// The combined admin's book page asks the stockroom frame for one book's figures (stockroomBridge.ts) and shows them
// (StockroomBookPanel.tsx). Only answers from the frame, on this address, to the question asked, count.
import { afterEach, describe, expect, it, vi } from "vitest";
import { FROM_ADMIN, FROM_STOCKROOM } from "./combined";
import { answerFor, stockroomBridge } from "./stockroomBridge";
import { channelWords, linkedStockroomBooks, money } from "./StockroomBookPanel";

const ORIGIN = "https://lmb-test-shop.web.app";

describe("answers from the stockroom", () => {
  const frame = {};
  const ev = (data: unknown, over: object = {}) => ({ source: frame, origin: ORIGIN, data, ...over });
  it("takes the answer to the question asked, from the frame, on this address", () => {
    expect(answerFor(ev({ source: FROM_STOCKROOM, type: "answer", id: "q1", result: { onHand: 3 } }), frame, ORIGIN, "q1")).toEqual({ result: { onHand: 3 } });
    expect(answerFor(ev({ source: FROM_STOCKROOM, type: "answer", id: "q1", result: 1, failed: true }), frame, ORIGIN, "q1")).toEqual({ result: null });
  });
  it("ignores another question's answer, another sender or another address", () => {
    expect(answerFor(ev({ source: FROM_STOCKROOM, type: "answer", id: "q2", result: 1 }), frame, ORIGIN, "q1")).toBeUndefined();
    expect(answerFor(ev({ source: FROM_STOCKROOM, type: "answer", id: "q1" }, { source: {} }), frame, ORIGIN, "q1")).toBeUndefined();
    expect(answerFor(ev({ source: FROM_STOCKROOM, type: "answer", id: "q1" }, { origin: "https://elsewhere.example" }), frame, ORIGIN, "q1")).toBeUndefined();
    expect(answerFor(ev({ source: "someone", type: "answer", id: "q1" }), frame, ORIGIN, "q1")).toBeUndefined();
  });
});

describe("asking the stockroom", () => {
  afterEach(() => { stockroomBridge.attach(null); vi.unstubAllGlobals(); });
  it("opens the frame when needed, waits for it, then asks and gets the answer", async () => {
    const listeners = new Set<(e: any) => void>();
    vi.stubGlobal("window", {
      location: { origin: ORIGIN },
      addEventListener: (_t: string, fn: any) => listeners.add(fn),
      removeEventListener: (_t: string, fn: any) => listeners.delete(fn),
      setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
    const posted: any[] = [];
    const frame = { postMessage: (m: any) => {
      posted.push(m);
      if (m.type === "ask") queueMicrotask(() => listeners.forEach((fn) => fn({ source: frame, origin: ORIGIN, data: { source: FROM_STOCKROOM, type: "answer", id: m.id, result: { id: m.book, onHand: 7 } } })));
    } };
    let needed = 0;
    const stop = stockroomBridge.onNeed(() => { needed += 1; queueMicrotask(() => stockroomBridge.attach(frame as any)); });
    expect(await stockroomBridge.ask({ what: "book", book: "b1" })).toEqual({ id: "b1", onHand: 7 });
    expect(needed).toBe(1);
    expect(posted.at(-1)).toMatchObject({ source: FROM_ADMIN, type: "ask", what: "book", book: "b1" });
    expect(listeners.size).toBe(0);
    stop();
  });
  it("opens a book's stockroom page once the frame is ready", () => {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
    const posted: any[] = [];
    const pages: string[] = [];
    const stop = stockroomBridge.onOpen((page) => pages.push(page));
    stockroomBridge.openBook("dashboard", "b1");
    expect(pages).toEqual(["dashboard"]);
    stockroomBridge.attach({ postMessage: (m: any) => posted.push(m) } as any);
    expect(posted).toEqual([{ source: FROM_ADMIN, type: "open", tab: "dashboard", book: "b1" }]);
    stop();
  });
});

describe("the book page's stock and sales", () => {
  it("lists the stockroom books a website book and its editions are matched to", () => {
    const links = { w1: { _: "s1", v2: "s2", v3: "" }, w2: { _: "s9" } };
    expect(linkedStockroomBooks(links, "w1", [{ id: "v2", name: "Hardback" }])).toEqual([{ edition: null, id: "s1" }, { edition: "Hardback", id: "s2" }]);
    expect(linkedStockroomBooks(links, "nope")).toEqual([]);
  });
  it("names the stockroom's channels in the admin's words, and shows money in its currency", () => {
    expect(channelWords("Book Fair")).toBe("Fairs and markets");
    expect(channelWords("Consignment")).toBe("Stockists");
    expect(channelWords("Something new")).toBe("Something new");
    expect(money(12.5, "CAD")).toMatch(/12\.50/);
    expect(money(3, "not-a-currency")).toBe("3.00 not-a-currency");
  });
});
