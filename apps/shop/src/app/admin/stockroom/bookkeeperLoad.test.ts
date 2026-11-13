// The accountant's desk (Team role "bookkeeper", BookkeeperDesk.tsx) reads the books as the owner's pages do, but takes
// the Tax centre from its key-free copy and never asks for the documents the stockroom's rules keep from the role.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookkeeperTaxCopy } from "@stockroom/bookkeeper-copy.js";
import { loadForBookkeeper, taxCenterFromCopy, type StockroomReads } from "./stockroomData";

const TAX_CENTER = {
  settings: { baseCurrency: "CAD", geminiKey: "secret-gemini", rates: { USD_CAD: 1.37 } },
  businessExpenses: [{ id: 1, date: "2026-02-03", desc: "Paper", cat: "Printing", currency: "CAD", amount: 120, baseAmount: 120, receipt: "https://files.example/r.pdf", sourceSnippet: "Dear publisher" }],
};

function fakeReads(asked: string[]): StockroomReads {
  const settings: Record<string, unknown> = {
    catalog: JSON.stringify({ "salt-hours": { title: "Salt Hours", listPrice: 20 }, "test-book": { title: "Test", isTest: true } }),
    taxCentreForBookkeeper: JSON.stringify(bookkeeperTaxCopy(TAX_CENTER, "2026-05-01T00:00:00.000Z")),
  };
  return {
    flags: async () => ({ fs_mode_global: true }),
    setting: async (key) => { asked.push(key); if (!(key in settings)) throw Object.assign(new Error("denied"), { code: "permission-denied" }); return settings[key]; },
    oldSetting: async () => { throw Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" }); },
    bookParts: async () => ({}),
    oldBook: async (id) => (id === "salt-hours" ? JSON.stringify({ hist: [{ qty: 2, price: 20, date: "2026-03-01" }] }) : null),
    submissions: async () => { asked.push("submissions"); return null; },
  };
}

describe("the accountant's books", () => {
  it("reads the catalogue, each item's records and the key-free Tax centre copy, and nothing else", async () => {
    const asked: string[] = [];
    const records = await loadForBookkeeper(fakeReads(asked));
    expect(asked.sort()).toEqual(["catalog", "taxCentreForBookkeeper"]);
    expect(records.books.map((b) => b.id)).toEqual(["salt-hours"]);
    expect(records.states["salt-hours"]).toEqual({ hist: [{ qty: 2, price: 20, date: "2026-03-01" }] });
    expect(records.taxCenter).toEqual({
      settings: { baseCurrency: "CAD", rates: { USD_CAD: 1.37 } },
      businessExpenses: [{ id: 1, date: "2026-02-03", desc: "Paper", cat: "Printing", currency: "CAD", amount: 120, baseAmount: 120, receipt: "https://files.example/r.pdf" }],
    });
    expect(JSON.stringify(records)).not.toContain("secret-gemini");
    expect(JSON.stringify(records)).not.toContain("Dear publisher");
  });

  it("an owner who never saved the Tax centre leaves it empty, not broken", () => {
    expect(taxCenterFromCopy(null)).toBeNull();
    expect(taxCenterFromCopy({})).toEqual({ settings: { baseCurrency: "CAD", rates: {} }, businessExpenses: [] });
  });

  it("the desk draws the money pages without their save handlers, so it offers no change", () => {
    const desk = readFileSync(new URL("../BookkeeperDesk.tsx", import.meta.url), "utf8");
    expect(desk).toContain("load={stockroomApi.loadForBookkeeper}");
    expect(desk).not.toMatch(/onTaxCenter|onState|onSaved=/);
    expect(desk).not.toMatch(/stockroomWrite|saveTaxCenter/);
  });
});
