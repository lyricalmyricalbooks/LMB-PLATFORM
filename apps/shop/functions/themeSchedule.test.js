import { describe, expect, it } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { planThemeSchedule, runThemeSchedule } = require("./themeSchedule.js");

// A tiny in-memory Firestore: collection/doc/get/set(mergeFields)/update/add, where(in), runTransaction.
function fakeDb(data) {
  const store = JSON.parse(JSON.stringify(data));
  let n = 0;
  const docRef = (col, id) => ({
    col, id,
    get: async () => ({ exists: !!store[col]?.[id], data: () => JSON.parse(JSON.stringify(store[col]?.[id])) }),
    set: async (value, opts) => write(col, id, value, opts),
    update: async (patch) => { store[col][id] = { ...store[col][id], ...patch }; },
  });
  const write = (col, id, value, opts) => {
    store[col] = store[col] || {};
    const prev = store[col][id] || {};
    store[col][id] = opts?.mergeFields || opts?.merge ? { ...prev, ...JSON.parse(JSON.stringify(value)) } : JSON.parse(JSON.stringify(value));
  };
  return {
    store,
    collection: (col) => ({
      doc: (id) => docRef(col, id),
      add: async (value) => { const id = `auto${++n}`; write(col, id, value); return { id }; },
      where: (field, _op, values) => ({ get: async () => ({ docs: Object.entries(store[col] || {}).filter(([, v]) => values.includes(v[field])).map(([id, v]) => ({ id, data: () => JSON.parse(JSON.stringify(v)) })) }) }),
    }),
    runTransaction: async (fn) => fn({ get: (ref) => ref.get(), set: (ref, v, o) => write(ref.col, ref.id, v, o), update: (ref, p) => { store[ref.col][ref.id] = { ...store[ref.col][ref.id], ...p }; } }),
  };
}
const T = (iso) => Date.parse(iso);

describe("theme schedule planner", () => {
  const entries = [
    { id: "a", kind: "publish", status: "scheduled", startAt: "2026-10-10T13:00:00.000Z", design: { a: 1 } },
    { id: "b", kind: "campaign", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z", endAt: "2026-10-20T12:00:00.000Z", design: { b: 1 } },
    { id: "c", kind: "campaign", status: "live", startAt: "2026-10-01T12:00:00.000Z", endAt: "2026-10-10T11:00:00.000Z", design: { c: 1 } },
    { id: "d", kind: "campaign", status: "scheduled", startAt: "2026-10-05T00:00:00.000Z", endAt: "2026-10-06T00:00:00.000Z", design: { d: 1 } },
    { id: "e", kind: "publish", status: "scheduled", startAt: "2026-12-01T00:00:00.000Z", design: { e: 1 } },
    { id: "f", kind: "publish", status: "cancelled", startAt: "2026-10-01T00:00:00.000Z", design: { f: 1 } },
  ];
  it("ends finished campaigns first, then starts what's due oldest first, skipping campaigns already over", () => {
    expect(planThemeSchedule(entries, T("2026-10-10T14:00:00Z"))).toEqual([
      { type: "end", id: "c" },
      { type: "skip", id: "d", reason: "ended-before-start" },
      { type: "start", id: "b" },
      { type: "start", id: "a" },
    ]);
  });
  it("does nothing before the time", () => {
    expect(planThemeSchedule(entries.filter(e => e.id === "e"), T("2026-10-10T14:00:00Z"))).toEqual([]);
  });
});

describe("runThemeSchedule", () => {
  it("publishes a due design, records a version and stamps the scheduler", async () => {
    const db = fakeDb({ settings: { website: { design: { live: 1 }, designPublishedAt: "2026-10-01T00:00:00.000Z" } },
      themeSchedule: { p: { kind: "publish", name: "Autumn", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z", design: { autumn: 1 } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:05:00.000Z"));
    expect(db.store.settings.website).toMatchObject({ design: { autumn: 1 }, designPublishedAt: "2026-10-10T12:05:00.000Z" });
    expect(db.store.themeSchedule.p).toMatchObject({ status: "done", startedAt: "2026-10-10T12:05:00.000Z" });
    expect(Object.values(db.store["theme-versions"])[0]).toMatchObject({ kind: "published", label: "Scheduled: Autumn", design: { autumn: 1 } });
    expect(db.store.themes.scheduler.lastRunAt).toBe("2026-10-10T12:05:00.000Z");
  });

  it("runs a campaign and puts the earlier design back when it ends", async () => {
    const db = fakeDb({ settings: { website: { design: { live: 1 }, designPublishedAt: "2026-10-01T00:00:00.000Z" } },
      themeSchedule: { s: { kind: "campaign", name: "Sale", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z", endAt: "2026-10-12T12:00:00.000Z", design: { sale: 1 } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:01:00.000Z"));
    expect(db.store.settings.website.design).toEqual({ sale: 1 });
    expect(db.store.themeSchedule.s).toMatchObject({ status: "live", revertDesign: { live: 1 } });
    await runThemeSchedule(db, new Date("2026-10-11T00:00:00.000Z"));
    expect(db.store.settings.website.design).toEqual({ sale: 1 });
    await runThemeSchedule(db, new Date("2026-10-12T12:10:00.000Z"));
    expect(db.store.settings.website.design).toEqual({ live: 1 });
    expect(db.store.themeSchedule.s).toMatchObject({ status: "done", revertDesign: null });
  });

  it("keeps a design the owner published during a campaign instead of switching back", async () => {
    const db = fakeDb({ settings: { website: { design: { live: 1 } } },
      themeSchedule: { s: { kind: "campaign", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z", endAt: "2026-10-12T12:00:00.000Z", design: { sale: 1 } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:01:00.000Z"));
    db.store.settings.website = { design: { manual: 1 }, designPublishedAt: "2026-10-11T09:00:00.000Z" };
    await runThemeSchedule(db, new Date("2026-10-12T12:10:00.000Z"));
    expect(db.store.settings.website.design).toEqual({ manual: 1 });
    expect(db.store.themeSchedule.s).toMatchObject({ status: "done", note: "kept-later-publish" });
  });

  it("leaves cancelled entries alone", async () => {
    const db = fakeDb({ settings: { website: { design: { live: 1 } } },
      themeSchedule: { x: { kind: "publish", status: "cancelled", startAt: "2026-10-01T00:00:00.000Z", design: { x: 1 } } } });
    expect(await runThemeSchedule(db, new Date("2026-10-10T00:00:00.000Z"))).toEqual([]);
    expect(db.store.settings.website.design).toEqual({ live: 1 });
  });
});

describe("live-only fields survive scheduled publishes and campaign reverts", () => {
  const cats = (...names) => names.map(name => ({ id: name.toLowerCase(), name }));
  it("a scheduled publish keeps categories and the under-construction wall edited live since it was scheduled", async () => {
    const db = fakeDb({ settings: { website: { design: { accent: "old", categories: cats("Poetry", "Zines"), showUnderConstruction: true }, designPublishedAt: "2026-10-01T00:00:00.000Z" } },
      themeSchedule: { p: { kind: "publish", name: "Autumn", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z",
        design: { accent: "autumn", categories: cats("Poetry"), showUnderConstruction: false }, liveBase: { categories: cats("Poetry"), showUnderConstruction: false } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:05:00.000Z"));
    expect(db.store.settings.website.design).toEqual({ accent: "autumn", categories: cats("Poetry", "Zines"), showUnderConstruction: true });
    expect(Object.values(db.store["theme-versions"])[0].design).toEqual(db.store.settings.website.design);
  });

  it("keeps categories the owner changed on purpose inside the scheduled design", async () => {
    const db = fakeDb({ settings: { website: { design: { categories: cats("Poetry") } } },
      themeSchedule: { p: { kind: "publish", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z",
        design: { categories: cats("Poetry", "Autumn picks") }, liveBase: { categories: cats("Poetry") } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:05:00.000Z"));
    expect(db.store.settings.website.design.categories).toEqual(cats("Poetry", "Autumn picks"));
  });

  it("entries made before liveBase existed let the current live value win", async () => {
    const db = fakeDb({ settings: { website: { design: { categories: cats("Poetry", "Zines") } } },
      themeSchedule: { p: { kind: "publish", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z", design: { categories: cats("Poetry") } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:05:00.000Z"));
    expect(db.store.settings.website.design.categories).toEqual(cats("Poetry", "Zines"));
  });

  it("a campaign end keeps a category added live while it ran, and restores the rest", async () => {
    const db = fakeDb({ settings: { website: { design: { accent: "old", categories: cats("Poetry") }, designPublishedAt: "2026-10-01T00:00:00.000Z" } },
      themeSchedule: { s: { kind: "campaign", name: "Sale", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z", endAt: "2026-10-12T12:00:00.000Z",
        design: { accent: "sale", categories: cats("Poetry") }, liveBase: { categories: cats("Poetry") } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:01:00.000Z"));
    expect(db.store.themeSchedule.s.appliedLiveOnly).toEqual({ categories: cats("Poetry") });
    // The owner adds a category from the Book editor (live only, no designPublishedAt change), and flips the wall on.
    db.store.settings.website.design = { ...db.store.settings.website.design, categories: cats("Poetry", "Zines"), showUnderConstruction: true };
    await runThemeSchedule(db, new Date("2026-10-12T12:10:00.000Z"));
    expect(db.store.settings.website.design).toEqual({ accent: "old", categories: cats("Poetry", "Zines"), showUnderConstruction: true });
    expect(db.store.themeSchedule.s).toMatchObject({ status: "done" });
  });

  it("a campaign end restores a field the campaign itself changed and nobody touched live", async () => {
    const db = fakeDb({ settings: { website: { design: { categories: cats("Poetry") } } },
      themeSchedule: { s: { kind: "campaign", status: "scheduled", startAt: "2026-10-10T12:00:00.000Z", endAt: "2026-10-12T12:00:00.000Z",
        design: { categories: cats("Poetry", "Sale") }, liveBase: { categories: cats("Poetry") } } } });
    await runThemeSchedule(db, new Date("2026-10-10T12:01:00.000Z"));
    expect(db.store.settings.website.design.categories).toEqual(cats("Poetry", "Sale"));
    await runThemeSchedule(db, new Date("2026-10-12T12:10:00.000Z"));
    expect(db.store.settings.website.design.categories).toEqual(cats("Poetry"));
  });
});
