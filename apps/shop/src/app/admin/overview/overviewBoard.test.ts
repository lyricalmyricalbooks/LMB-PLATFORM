import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BANDS, TEMPLATES, WIDGETS, MAX_BOARDS, addBoard, addWidget, canAdd, collapseBandWidgets, collapseEverything, copyBoard, countOf,
  defaultStore, deleteBoard, duplicateWidget, findWidget, moveBand, moveWidget, moveWidgetTo, newerStore, normalizeBoard, normalizeStore,
  removeWidget, restoreWidget, revealWidget, renameBoard, renameWidget, resetBoard, searchCatalog, selectBoard, setWidgetConfig, templateBoard, updateWidget,
  visibleBands, widgetMeta, widgetTitle, activeBoard, setBoardView, cleanView, sameView, replaceBoard, type Board,
} from "./overviewBoard";

const ids = (b: Board, band: string) => b.bands.find(x => x.id === band)!.widgets.map(w => w.type);

describe("overview board catalog", () => {
  it("has unique widget types, each in a real topic", () => {
    const types = WIDGETS.map(w => w.type);
    expect(new Set(types).size).toBe(types.length);
    WIDGETS.forEach(w => expect(BANDS.some(b => b.id === w.band)).toBe(true));
  });

  it("keeps page speed away from best sellers", () => {
    expect(widgetMeta("speed").band).not.toBe(widgetMeta("best").band);
  });

  it("every template builds a valid board: widgets in their own topic, no doubled single widgets", () => {
    TEMPLATES.forEach(t => {
      const b = templateBoard(t.id);
      expect(b.bands.map(x => x.id).sort()).toEqual(BANDS.map(x => x.id).sort());
      b.bands.forEach(band => band.widgets.forEach(w => expect(widgetMeta(w.type).band).toBe(band.id)));
      b.bands.forEach(band => {
        const singles = band.widgets.filter(w => !widgetMeta(w.type).multi).map(w => w.type);
        expect(new Set(singles).size).toBe(singles.length);
      });
      // A template survives a save and reload unchanged.
      expect(normalizeBoard(JSON.parse(JSON.stringify(b)))).toEqual(b);
    });
  });

  it("the Everything template holds every widget", () => {
    const b = templateBoard("everything");
    WIDGETS.forEach(w => expect(countOf(b, w.type)).toBe(1));
  });

  it("every panel widget is a panel the Overview components can show on its own", () => {
    const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
    const panels: Record<string, string> = {
      sales: src("OverviewSales.tsx"), traffic: src("OverviewMarketing.tsx"), search: src("OverviewMarketing.tsx"),
      customers: src("OverviewCustomers.tsx"), stock: src("OverviewStock.tsx"),
    };
    const dash = src("AnalyticsDashboard.tsx");
    WIDGETS.forEach(w => {
      if (new RegExp(`case "${w.type}"`).test(dash)) return; // drawn by the dashboard itself
      const code = panels[w.band];
      expect(code, `${w.type} has nowhere to render`).toBeTruthy();
      const id = w.type === "custKpis" || w.type === "stockKpis" ? "kpis" : w.type;
      expect(code.includes(`"${id}"`) || new RegExp(`[{,]\\s*${id}:`).test(code), `${w.type} is not a panel id in its component`).toBe(true);
    });
  });
});

describe("overview board edits", () => {
  const base = () => templateBoard("desk");

  it("adds a widget to its own topic and opens that topic", () => {
    let b = base();
    b = { ...b, bands: b.bands.map(x => (x.id === "search" ? { ...x, collapsed: true, hidden: true } : x)) };
    const r = addWidget(b, "googleQueries");
    expect(r.id).toBeTruthy();
    const band = r.board.bands.find(x => x.id === "search")!;
    expect(band.widgets.at(-1)!.type).toBe("googleQueries");
    expect(band.collapsed).toBe(false);
    expect(band.hidden).toBe(false);
  });

  it("adds single widgets once, charts as often as wanted", () => {
    const b = base();
    expect(canAdd(b, "best")).toBe(false);
    expect(addWidget(b, "best").id).toBeNull();
    const r = addWidget(b, "chart", { metric: "visitors" });
    expect(countOf(r.board, "chart")).toBe(countOf(b, "chart") + 1);
    expect(findWidget(r.board, r.id!)!.widget.config!.metric).toBe("visitors");
  });

  it("duplicates only widgets that may appear twice", () => {
    const b = base();
    const best = b.bands.find(x => x.id === "sales")!.widgets.find(w => w.type === "best")!;
    expect(duplicateWidget(b, best.id).id).toBeNull();
    const chart = b.bands.find(x => x.id === "sales")!.widgets.find(w => w.type === "chart")!;
    const r = duplicateWidget(b, chart.id);
    const list = ids(r.board, "sales");
    expect(list.filter(t => t === "chart").length).toBe(2);
    expect(list.indexOf("chart") + 1).toBe(list.lastIndexOf("chart"));
  });

  it("removes, resizes, renames and folds", () => {
    let b = base();
    const w = b.bands.find(x => x.id === "sales")!.widgets[0];
    b = updateWidget(b, w.id, { size: "xl", height: "tall", collapsed: true });
    expect(findWidget(b, w.id)!.widget).toMatchObject({ size: "xl", height: "tall", collapsed: true });
    b = renameWidget(b, w.id, "  My pick  ");
    expect(widgetTitle(findWidget(b, w.id)!.widget)).toBe("My pick");
    b = renameWidget(b, w.id, "");
    expect(findWidget(b, w.id)!.widget.title).toBeUndefined();
    b = removeWidget(b, w.id);
    expect(findWidget(b, w.id)).toBeNull();
  });

  it("puts a removed widget back in its place, even after other changes", () => {
    const b = base();
    const sales = b.bands.find(x => x.id === "sales")!.widgets;
    const gone = sales[2];
    let next = removeWidget(b, gone.id);
    next = updateWidget(next, sales[0].id, { size: "xl" });
    next = restoreWidget(next, gone, 2);
    expect(ids(next, "sales")).toEqual(sales.map(w => w.type));
    expect(findWidget(next, sales[0].id)!.widget.size).toBe("xl");
    expect(restoreWidget(next, gone, 2)).toBe(next);
  });

  it("reveals a widget hidden in a folded or hidden topic", () => {
    const b = base();
    const w = b.bands.find(x => x.id === "stock")!.widgets[0];
    let hidden = { ...b, bands: b.bands.map(x => (x.id === "stock" ? { ...x, hidden: true, collapsed: true } : x)) };
    hidden = updateWidget(hidden, w.id, { collapsed: true });
    const shown = revealWidget(hidden, w.id);
    const band = shown.bands.find(x => x.id === "stock")!;
    expect(band.hidden).toBe(false);
    expect(band.collapsed).toBe(false);
    expect(findWidget(shown, w.id)!.widget.collapsed).toBe(false);
    expect(revealWidget(shown, w.id)).toBe(shown);
  });

  it("names charts after what they draw", () => {
    const b = addWidget(base(), "chart", { metric: "orders" });
    expect(widgetTitle(findWidget(b.board, b.id!)!.widget)).toBe("Orders chart");
  });

  it("moves widgets only within their topic", () => {
    const b = base();
    const sales = b.bands.find(x => x.id === "sales")!.widgets;
    const [a, second] = sales;
    expect(ids(moveWidget(b, a.id, 1), "sales").slice(0, 2)).toEqual([second.type, a.type]);
    expect(moveWidget(b, a.id, -1)).toEqual(b);
    const last = moveWidgetTo(b, a.id, null);
    expect(ids(last, "sales").at(-1)).toBe(a.type);
    const before = moveWidgetTo(last, a.id, second.id);
    expect(ids(before, "sales").indexOf(a.type)).toBe(ids(before, "sales").indexOf(second.type) - 1);
    const other = b.bands.find(x => x.id === "stock")!.widgets[0];
    expect(moveWidgetTo(b, a.id, other.id)).toBe(b);
  });

  it("moves topics and folds everything", () => {
    const b = base();
    const moved = moveBand(b, b.bands[1].id, -1);
    expect(moved.bands[0].id).toBe(b.bands[1].id);
    const folded = collapseEverything(b, true);
    expect(folded.bands.every(x => x.collapsed && x.widgets.every(w => w.collapsed))).toBe(true);
    const oneBand = collapseBandWidgets(folded, "sales", false);
    const sales = oneBand.bands.find(x => x.id === "sales")!;
    expect(sales.collapsed).toBe(false);
    expect(sales.widgets.every(w => !w.collapsed)).toBe(true);
  });

  it("hides empty and hidden topics unless editing", () => {
    let b = base();
    b = { ...b, bands: b.bands.map(x => (x.id === "stock" ? { ...x, hidden: true } : x.id === "search" ? { ...x, widgets: [] } : x)) };
    expect(visibleBands(b, false).map(x => x.id)).not.toContain("stock");
    expect(visibleBands(b, false).map(x => x.id)).not.toContain("search");
    expect(visibleBands(b, true).map(x => x.id)).toContain("search");
  });

  it("keeps chart and figure settings to known values", () => {
    const r = addWidget(base(), "chart");
    let b = setWidgetConfig(r.board, r.id!, { metric: "nonsense" as any, grain: "week" });
    expect(findWidget(b, r.id!)!.widget.config).toMatchObject({ metric: "revenue", grain: "week" });
    const figs = b.bands.find(x => x.id === "sales")!.widgets.find(w => w.type === "figures")!;
    b = setWidgetConfig(b, figs.id, { figures: ["refunds", "bogus" as any, "revenue"] });
    expect(findWidget(b, figs.id)!.widget.config!.figures).toEqual(["revenue", "refunds"]);
  });
});

describe("overview board storage", () => {
  it("repairs anything read back from storage", () => {
    const b = normalizeBoard({
      id: "x", name: "  Mine ", density: "compact", template: "nope",
      bands: [
        { id: "stock", collapsed: true, widgets: [{ id: "a", type: "best", size: "huge" }, { id: "a", type: "reprint" }, { type: "low" }, { type: "low" }, { type: "ghost" }] },
        { id: "stock" }, { id: "nowhere" },
      ],
    });
    expect(b.name).toBe("Mine");
    expect(b.density).toBe("compact");
    expect(b.template).toBe("desk");
    expect(b.bands.map(x => x.id).sort()).toEqual(BANDS.map(x => x.id).sort());
    expect(b.bands[0]).toMatchObject({ id: "stock", collapsed: true });
    expect(ids(b, "stock")).toEqual(["reprint", "low"]);
    expect(ids(b, "sales")).toEqual(["best"]); // moved to its own topic
    expect(findWidget(b, "a")!.widget.type).toBe("best");
    expect(findWidget(b, "a")!.widget.size).toBe(widgetMeta("best").size);
    const all = b.bands.flatMap(x => x.widgets.map(w => w.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it("falls back to the default store for junk", () => {
    expect(normalizeStore(null).boards.length).toBe(1);
    expect(normalizeStore({ boards: "x" }).boards.length).toBe(1);
    const s = normalizeStore({ v: 1, activeId: "missing", boards: [templateBoard("money")], updatedAt: 5 });
    expect(activeBoard(s).template).toBe("money");
  });

  it("adds, copies, selects, renames, resets and deletes boards", () => {
    let s = defaultStore(1);
    s = addBoard(s, "stock", undefined, 2);
    expect(s.boards.length).toBe(2);
    expect(activeBoard(s).template).toBe("stock");
    s = addBoard(s, "stock", undefined, 3);
    expect(activeBoard(s).name).toBe("Stock 2");
    s = copyBoard(s, undefined, 4);
    const copy = activeBoard(s);
    expect(copy.name).toBe("Stock 2 copy");
    const orig = s.boards[2];
    const copyIds = copy.bands.flatMap(b => b.widgets.map(w => w.id));
    orig.bands.flatMap(b => b.widgets.map(w => w.id)).forEach(id => expect(copyIds).not.toContain(id));
    s = renameBoard(s, copy.id, "  Launch  ", 5);
    expect(activeBoard(s).name).toBe("Launch");
    expect(renameBoard(s, copy.id, "   ")).toBe(s);
    const changed = { ...activeBoard(s), bands: activeBoard(s).bands.map(b => ({ ...b, widgets: [] })) };
    s = { ...s, boards: s.boards.map(b => (b.id === changed.id ? changed : b)) };
    s = resetBoard(s, changed.id, 6);
    expect(activeBoard(s).bands.some(b => b.widgets.length > 0)).toBe(true);
    expect(activeBoard(s).id).toBe(changed.id);
    s = selectBoard(s, s.boards[0].id, 7);
    expect(s.activeId).toBe(s.boards[0].id);
    s = deleteBoard(s, s.boards[0].id, 8);
    expect(s.boards.length).toBe(3);
    expect(s.boards.some(b => b.id === s.activeId)).toBe(true);
    let one = defaultStore(1);
    expect(deleteBoard(one, one.boards[0].id)).toBe(one);
    for (let i = 0; i < MAX_BOARDS + 3; i++) one = addBoard(one, "desk");
    expect(one.boards.length).toBe(MAX_BOARDS);
  });

  it("keeps the newer of two copies", () => {
    const a = defaultStore(10);
    const b = defaultStore(20);
    expect(newerStore(a, b)).toBe(b);
    expect(newerStore(b, a)).toBe(b);
    expect(newerStore(null, a)).toBe(a);
    expect(newerStore(a, null)).toBe(a);
  });
});

describe("shared reads", () => {
  it("shares one read until cleared, and never keeps a failed one", async () => {
    const { sharedLoad, clearShared } = await import("./overviewShared");
    let n = 0;
    const load = () => Promise.resolve(++n);
    expect(await sharedLoad("k", load)).toBe(1);
    expect(await sharedLoad("k", load)).toBe(1);
    clearShared();
    expect(await sharedLoad("k", load)).toBe(2);
    await sharedLoad("bad", () => Promise.reject(new Error("x"))).catch(() => {});
    await Promise.resolve();
    expect(await sharedLoad("bad", load)).toBe(3);
  });
});

describe("add-widget search", () => {
  it("finds widgets by any word, grouped by topic", () => {
    const hits = searchCatalog("google").flatMap(g => g.widgets.map(w => w.type));
    expect(hits).toContain("googleQueries");
    expect(hits).toContain("gaKpis");
    expect(searchCatalog("").reduce((n, g) => n + g.widgets.length, 0)).toBe(WIDGETS.length);
    expect(searchCatalog("zzzz nothing")).toEqual([]);
    const groups = searchCatalog("stock").map(g => g.band.id);
    expect(groups).toEqual(BANDS.map(b => b.id).filter(id => groups.includes(id)));
  });
});

describe("a board's saved period", () => {
  it("saves, keeps through storage, copy and reset, and forgets", () => {
    let s = defaultStore(1);
    const b = setBoardView(activeBoard(s), { preset: "365d", compare: "lastYear" });
    expect(b.view).toEqual({ preset: "365d", compare: "lastYear" });
    s = replaceBoard(s, b, 2);
    expect(normalizeStore(JSON.parse(JSON.stringify(s))).boards[0].view).toEqual({ preset: "365d", compare: "lastYear" });
    expect(activeBoard(copyBoard(s, undefined, 3)).view).toEqual(b.view);
    expect(resetBoard(s, b.id, 4).boards[0].view).toEqual(b.view);
    const forgot = setBoardView(b, null);
    expect(forgot.view).toBeUndefined();
    expect("view" in forgot).toBe(false);
    expect(setBoardView(b, { preset: "365d", compare: "lastYear" })).toBe(b);
  });

  it("refuses unknown presets and half-filled custom dates", () => {
    expect(cleanView({ preset: "decade", compare: "previous" })).toBeUndefined();
    expect(cleanView({ preset: "custom", compare: "previous", from: "2026-10-01" })).toBeUndefined();
    expect(cleanView({ preset: "custom", compare: "previous", from: "2026-10-09", to: "2026-10-01" })).toBeUndefined();
    expect(cleanView({ preset: "custom", compare: "x", from: "2026-10-01", to: "2026-10-09" })).toEqual({ preset: "custom", compare: "previous", from: "2026-10-01", to: "2026-10-09" });
    expect(cleanView({ preset: "7d", compare: "previous", from: "junk" })).toEqual({ preset: "7d", compare: "previous" });
    expect(sameView({ preset: "custom", compare: "previous", from: "a", to: "b" }, { preset: "custom", compare: "previous", from: "a", to: "c" })).toBe(false);
  });

  it("keeps a chart's visitor bars switch", () => {
    const w = normalizeBoard({ bands: [{ id: "sales", widgets: [{ id: "c1", type: "chart", size: "l", config: { metric: "orders", bars: false } }] }] }).bands.find(x => x.id === "sales")!.widgets[0];
    expect(w.config).toMatchObject({ metric: "orders", bars: false });
  });
});
