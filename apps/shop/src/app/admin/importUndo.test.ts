import { describe, expect, it } from "vitest";
import { forgetRun, nothingToUndo, planUndo, rememberRun, runRecord, savedRuns, undoWords, type ImportRun } from "./importUndo";

const run = (over: Partial<ImportRun> = {}): ImportRun => ({ id: "run-1", at: "2026-11-13T10:00:00.000Z", file: "products.csv", created: [], updated: [], redirects: [], ...over });
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const NOW = Date.parse("2026-11-13T12:00:00Z");

describe("taking an import back", () => {
  it("deletes only the drafts the import added that are still drafts", () => {
    const plan = planUndo(run({ created: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "gone", title: "Gone" }] }),
      [{ id: "a", title: "A", status: "draft" }, { id: "b", title: "B", status: "published" }, { id: "other", title: "Mine", status: "draft" }]);
    expect(plan.remove).toEqual([{ id: "a", title: "A" }]);
    expect(plan.kept).toEqual(["1 product this import added is no longer a draft, so it stays."]);
  });

  it("puts back only the details that still hold what the import wrote", () => {
    const updated = [{ id: "a", title: "A", before: { retailPrice: 10, tags: ["x"] }, after: { retailPrice: 12, tags: ["x", "y"], publisher: "Tide" } }];
    const plan = planUndo(run({ updated }), [{ id: "a", title: "A", retailPrice: 12, tags: ["x", "y", "z"], publisher: "Tide" }]);
    // Price still as imported → back to 10. Tags changed since → kept. Publisher was blank before → blank again.
    expect(plan.restore).toEqual([{ id: "a", title: "A", patch: { retailPrice: 10, publisher: "" } }]);
    expect(plan.kept).toEqual(["1 detail was changed again after the import, so it stays as it is now."]);
  });

  it("never puts a stock number back", () => {
    const plan = planUndo(run({ updated: [{ id: "a", title: "A", before: { stockLevel: 3 }, after: { stockLevel: 20 } }] }), [{ id: "a", stockLevel: 20 }]);
    expect(nothingToUndo(plan)).toBe(true);
    expect(plan.kept[0]).toMatch(/^Stock numbers the import set \(1 product\) stay/);
  });

  it("has nothing to do once it was taken back", () => {
    const first = run({ created: [{ id: "a", title: "A" }], updated: [{ id: "b", title: "B", before: { title: "B" }, after: { title: "B2" } }] });
    expect(nothingToUndo(planUndo(first, [{ id: "b", title: "B" }]))).toBe(true);
  });

  it("says what it will take back", () => {
    expect(undoWords({ remove: [{ id: "a", title: "A" }], restore: [], kept: [] })).toBe("1 new draft");
    expect(undoWords({ remove: [{ id: "a", title: "A" }, { id: "b", title: "B" }], restore: [{ id: "c", title: "C", patch: {} }], kept: [] })).toBe("2 new drafts and changes to 1 product");
  });

  it("records what each changed product held before", () => {
    const r = runRecord("run-9", "2026-11-13T10:00:00.000Z", "f.csv", [], [{ id: "a", title: "A", patch: { retailPrice: 12, publisher: "Tide" }, loaded: { id: "a", retailPrice: 10, secret: 1 } }], []);
    expect(r.updated).toEqual([{ id: "a", title: "A", after: { retailPrice: 12, publisher: "Tide" }, before: { retailPrice: 10 } }]);
  });
});

describe("kept in this browser", () => {
  it("keeps the newest five runs, newest first, and forgets one taken back", () => {
    const m = memory();
    for (let i = 1; i <= 7; i++) rememberRun(run({ id: `run-${i}`, created: [{ id: `b${i}`, title: "T" }] }), m, NOW);
    expect(savedRuns(NOW, m).map(r => r.id)).toEqual(["run-7", "run-6", "run-5", "run-4", "run-3"]);
    forgetRun("run-6", m, NOW);
    expect(savedRuns(NOW, m).map(r => r.id)).toEqual(["run-7", "run-5", "run-4", "run-3"]);
  });

  it("doesn't keep a run that saved nothing, or offer one older than two weeks", () => {
    const m = memory();
    rememberRun(run(), m, NOW);
    expect(savedRuns(NOW, m)).toEqual([]);
    rememberRun(run({ created: [{ id: "a", title: "A" }] }), m, NOW);
    expect(savedRuns(NOW + 15 * 86400000, m)).toEqual([]);
  });

  it("lets a huge run's changes go but keeps the drafts it added", () => {
    const m = memory();
    const big = "x".repeat(2000);
    rememberRun(run({ created: [{ id: "a", title: "A" }], updated: Array.from({ length: 500 }, (_, i) => ({ id: `u${i}`, title: "U", before: { description: big }, after: { description: big + "!" } })) }), m, NOW);
    expect(savedRuns(NOW, m)).toEqual([expect.objectContaining({ created: [{ id: "a", title: "A" }], updated: [] })]);
  });

  it("reads a broken record as none", () => {
    const m = memory();
    m.setItem("lm:product-imports", "{not json");
    expect(savedRuns(NOW, m)).toEqual([]);
  });
});
