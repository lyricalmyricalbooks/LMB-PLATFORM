// The stockroom's online copies: the old app's shape, one daily copy, 30 kept, and bringing back one item or everything
// after a fresh copy is made.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {} }));

const { KEEP_COPIES, bringBack, catalogFromCopy, itemsInCopy, makeCopy, planCopy, readManifest, snapshotOf } = await import("./stockroomCopies");
type IO = Parameters<typeof makeCopy>[1];

const NOW = new Date(2026, 10, 11, 9, 30).getTime();
const DAY = 24 * 60 * 60 * 1000;

function memory(start: { catalog?: Record<string, unknown>; states?: Record<string, any>; settings?: Record<string, unknown> } = {}) {
  const store = {
    catalog: start.catalog ?? { salt: { title: "Salt Almanac" }, moth: { title: "Moth Songs" }, _posExtra: { tote: { name: "Tote" } }, _deletedDefaults: ["demo"] } as Record<string, unknown>,
    states: start.states ?? { salt: { stock: 4, hist: [{ qty: 1 }] }, moth: { stock: 2, hist: [] } } as Record<string, any>,
    settings: start.settings ?? { taxCenter: { year: 2026 }, customerSuppress: { emails: ["a@example.com"] } } as Record<string, unknown>,
    list: [] as any[],
    copies: {} as Record<string, string>,
    deleted: [] as string[],
    writes: [] as string[],
  };
  const io = {
    list: async () => readManifest(store.list),
    whole: async () => ({ catalog: store.catalog, states: store.states, settings: store.settings }),
    writeCopy: async (id: string, text: string) => { store.copies[id] = text; store.writes.push(`copy:${id}`); },
    readCopy: async (id: string) => (store.copies[id] ? JSON.parse(store.copies[id]) : null),
    deleteCopy: async (id: string) => { delete store.copies[id]; store.deleted.push(id); },
    saveList: async (change: (l: any[]) => any[]) => { store.list = change(readManifest(store.list)); store.writes.push("list"); },
    saveSetting: async (key: string, change: (cur: unknown) => unknown) => {
      if (key === "catalog") store.catalog = change(store.catalog) as Record<string, unknown>;
      else store.settings[key] = change(store.settings[key]);
      store.writes.push(`setting:${key}`);
      return { status: "saved", value: null, merged: false, conflicts: [] } as any;
    },
    saveBook: async (id: string, state: Record<string, unknown>) => {
      if (!store.catalog[id]) return { status: "refused", reason: "unknown-book", message: "no" } as any;
      store.states[id] = state; store.writes.push(`book:${id}`);
      return { status: "saved" } as any;
    },
  };
  return { store, io: io as unknown as IO };
}

describe("the copy's shape", () => {
  it("is the old app's v2.6 snapshot, items without the catalogue's own keys", () => {
    const { store } = memory();
    const snap = snapshotOf({ catalog: store.catalog, states: store.states, settings: store.settings }, NOW);
    expect(snap.version).toBe("2.6");
    expect(Object.keys(snap.BOOKS)).toEqual(["salt", "moth"]);
    expect(snap.posExtra).toEqual({ tote: { name: "Tote" } });
    expect(snap.deletedDefaults).toEqual(["demo"]);
    expect(snap.TAX_CENTER).toEqual({ year: 2026 });
    expect(snap.customerSuppress).toEqual(["a@example.com"]);
    expect(itemsInCopy(snap).map((i) => i.title)).toEqual(["Moth Songs", "Salt Almanac"]);
    expect(catalogFromCopy(snap, {})).toMatchObject({ salt: { title: "Salt Almanac" }, _posExtra: { tote: { name: "Tote" } }, _deletedDefaults: ["demo"] });
  });

  it("reads the stored list newest first and leaves junk out", () => {
    const list = readManifest([{ id: "sb-1", createdAt: 1, type: "auto" }, null, { id: 3 }, { id: "sb-2", createdAt: 2, type: "manual", bookCount: 3 }]);
    expect(list.map((e) => e.id)).toEqual(["sb-2", "sb-1"]);
    expect(list[0]).toMatchObject({ type: "manual", bookCount: 3 });
  });
});

describe("making copies", () => {
  it("makes one daily copy, and Copy now always makes one", () => {
    const today = [{ id: "sb-x", dayKey: "", type: "auto" as const, createdAt: NOW - 60_000, bookCount: 1 }];
    expect(planCopy(today, "auto", 2, NOW)).toBeNull();
    expect(planCopy(today, "manual", 2, NOW)?.entry).toMatchObject({ id: `sb-${NOW}`, type: "manual", bookCount: 2 });
    expect(planCopy([{ ...today[0], createdAt: NOW - DAY }], "auto", 2, NOW)).not.toBeNull();
  });

  it("writes the copy before the list, and drops copies past 30 with their documents", async () => {
    const { store, io } = memory();
    store.list = Array.from({ length: KEEP_COPIES }, (_, i) => ({ id: `sb-old-${i}`, type: "auto", createdAt: NOW - (i + 1) * DAY, bookCount: 2 }));
    const entry = await makeCopy("auto", io, NOW);
    expect(entry?.bookCount).toBe(2);
    expect(store.writes.slice(0, 2)).toEqual([`copy:sb-${NOW}`, "list"]);
    expect(store.list).toHaveLength(KEEP_COPIES);
    expect(store.list[0].id).toBe(`sb-${NOW}`);
    expect(store.deleted).toEqual([`sb-old-${KEEP_COPIES - 1}`]);
    expect(await makeCopy("auto", io, NOW + 1000)).toBeNull();
  });

  it("refuses a stockroom too big for one copy, and writes nothing", async () => {
    const { store, io } = memory({ states: { salt: { notes: "x".repeat(1_100_000) } } });
    await expect(makeCopy("manual", io, NOW)).rejects.toThrow(/too big/);
    expect(store.writes).toEqual([]);
  });
});

describe("bringing back", () => {
  it("brings one item back, even one since removed from the catalogue, after a fresh copy", async () => {
    const { store, io } = memory();
    const first = await makeCopy("manual", io, NOW - DAY);
    store.states.salt = { stock: 0, hist: [{ qty: 1 }, { qty: 4 }] };
    delete store.catalog.salt;
    const r = await bringBack(first!.id, "salt", io);
    expect(r.ok).toBe(true);
    expect(store.catalog.salt).toEqual({ title: "Salt Almanac" });
    expect(store.states.salt).toEqual({ stock: 4, hist: [{ qty: 1 }] });
    expect(store.list).toHaveLength(2);
    expect(store.writes.indexOf("setting:catalog")).toBeGreaterThan(store.writes.lastIndexOf("list"));
  });

  it("brings everything back: the catalogue, every item and the settings it holds", async () => {
    const { store, io } = memory();
    const first = await makeCopy("manual", io, NOW - DAY);
    store.catalog = { salt: { title: "Salt Almanac" }, fern: { title: "Fern" } };
    store.states.moth = { stock: 9 };
    store.settings.taxCenter = { year: 2027 };
    const r = await bringBack(first!.id, null, io);
    expect(r).toMatchObject({ ok: true });
    expect(Object.keys(store.catalog).sort()).toEqual(["_deletedDefaults", "_posExtra", "moth", "salt"]);
    expect(store.states.moth).toEqual({ stock: 2, hist: [] });
    expect(store.settings.taxCenter).toEqual({ year: 2026 });
    expect(store.settings.customerSuppress).toEqual({ emails: ["a@example.com"] });
  });

  it("changes nothing for an unreadable copy or an item the copy doesn't hold", async () => {
    const { store, io } = memory();
    expect((await bringBack("sb-missing", "salt", io)).ok).toBe(false);
    const first = await makeCopy("manual", io, NOW);
    store.writes = [];
    expect((await bringBack(first!.id, "fern", io)).ok).toBe(false);
    expect(store.writes).toEqual([]);
  });
});
