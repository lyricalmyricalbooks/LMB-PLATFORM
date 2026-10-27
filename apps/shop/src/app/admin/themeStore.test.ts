import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory Firestore: enough for the theme store's reads, field-path merges,
// transactions and batches, plus a switch that refuses the new private paths the way
// Firestore does before the rules are deployed.
const DELETE = Symbol("deleteField");
const store = new Map<string, any>();
let denyPrivate = false;
const clone = (v: any) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const isPrivate = (path: string) => path.startsWith("themes/") || path.startsWith("savedThemes");
const guard = (path: string) => { if (denyPrivate && isPrivate(path)) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }); };
function setPath(target: any, path: string[], value: any) {
  let node = target;
  for (const key of path.slice(0, -1)) node = node[key] = node[key] && typeof node[key] === "object" ? node[key] : {};
  const last = path[path.length - 1];
  if (value === DELETE) delete node[last]; else node[last] = clone(value);
}
function write(path: string, data: any, options?: { mergeFields?: string[] }) {
  guard(path);
  if (!options?.mergeFields) { store.set(path, clone(data)); return; }
  const next = clone(store.get(path) || {});
  for (const field of options.mergeFields) {
    const keys = field.split(".");
    const value = keys.reduce((n: any, k) => n?.[k], data);
    setPath(next, keys, value);
  }
  store.set(path, next);
}
const snapshot = (path: string) => ({ exists: () => store.has(path), data: () => clone(store.get(path)), id: path.split("/").pop() });

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: async (ref: any) => { guard(ref.path); return snapshot(ref.path); },
  getDocs: async (ref: any) => { guard(ref.path); return { docs: [...store.keys()].filter(k => k.startsWith(ref.path + "/")).map(snapshot) }; },
  setDoc: async (ref: any, data: any, options?: any) => write(ref.path, data, options),
  deleteField: () => DELETE,
  runTransaction: async (_db: unknown, fn: any) => {
    const writes: (() => void)[] = [];
    await fn({ get: async (ref: any) => { guard(ref.path); return snapshot(ref.path); }, set: (ref: any, data: any, options?: any) => { writes.push(() => write(ref.path, data, options)); } });
    writes.forEach(w => w());
  },
  writeBatch: () => {
    const ops: (() => void)[] = [];
    return { set: (ref: any, data: any) => ops.push(() => write(ref.path, data)), delete: (ref: any) => ops.push(() => { guard(ref.path); store.delete(ref.path); }), commit: async () => ops.forEach(o => o()) };
  },
  addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getCountFromServer: vi.fn(), startAfter: vi.fn(), increment: vi.fn(), serverTimestamp: vi.fn(), Timestamp: { now: vi.fn() },
}));
vi.mock("firebase/auth", () => ({ signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn() }));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));

const themeStore = await import("./themeStore");
const { adminApi } = await import("./api");
const { auditLog } = await import("./auditLog");
const { openWorkspace, saveDraft, publishDesign, discardDraft, saveSavedThemes, ThemeConflictError, ThemeStoreUnavailableError } = themeStore;

const live = { primaryColor: "black", heroPage: { sections: [] } };
const draft = { primaryColor: "red", heroPage: { sections: [{ id: "s1", type: "HeroSection", settings: {} }] } };
const theme = { id: "t1", name: "Spring", design: { primaryColor: "green" }, savedAt: "2026-10-01" };

beforeEach(() => {
  store.clear(); denyPrivate = false;
  store.set("settings/website", { design: live, draftDesign: draft, savedThemes: [theme], info: { name: "Shop" } });
  vi.spyOn(auditLog, "record").mockResolvedValue(undefined as any);
});

describe("Studio theme store", () => {
  it("moves the public draft and My themes into private documents, then removes the public copies", async () => {
    const settings = clone(store.get("settings/website"));
    const ws = await openWorkspace(settings);
    expect(ws).toMatchObject({ draft, rev: 1 });
    expect(ws.savedThemes.map(t => t.id)).toEqual(["t1"]);
    expect(store.get("themes/workspace").draft).toEqual(draft);
    expect(store.get("savedThemes/t1").name).toBe("Spring");
    const pub = store.get("settings/website");
    expect(pub.draftDesign).toBeUndefined();
    expect(pub.savedThemes).toBeUndefined();
    expect(pub.design).toEqual(live);
    expect(pub.info).toEqual({ name: "Shop" });
  });

  it("opening again is a no-op that keeps the private draft", async () => {
    await openWorkspace(clone(store.get("settings/website")));
    const again = await openWorkspace(clone(store.get("settings/website")));
    expect(again).toMatchObject({ draft, rev: 1 });
  });

  it("saves drafts privately with a rising revision and never touches the live design", async () => {
    const ws = await openWorkspace(clone(store.get("settings/website")));
    const rev = await saveDraft(ws, { ...draft, primaryColor: "blue" }, ws.rev);
    expect(rev).toBe(2);
    expect(store.get("themes/workspace").draft.primaryColor).toBe("blue");
    expect(store.get("settings/website").design).toEqual(live);
    expect(store.get("settings/website").draftDesign).toBeUndefined();
  });

  it("refuses a save from a tab that loaded an older revision", async () => {
    const ws = await openWorkspace(clone(store.get("settings/website")));
    await saveDraft(ws, { ...draft, primaryColor: "blue" }, ws.rev);
    const stale = saveDraft(ws, { ...draft, primaryColor: "pink" }, ws.rev);
    await expect(stale).rejects.toBeInstanceOf(ThemeConflictError);
    await stale.catch((e: any) => expect(e.server).toMatchObject({ rev: 2, draft: { primaryColor: "blue" } }));
    expect(store.get("themes/workspace").draft.primaryColor).toBe("blue");
  });

  it("publishes the live design and the draft together", async () => {
    const ws = await openWorkspace(clone(store.get("settings/website")));
    const next = { ...draft, primaryColor: "navy" };
    expect(await publishDesign(ws, next, ws.rev)).toBe(2);
    expect(store.get("settings/website").design).toEqual(next);
    expect(store.get("settings/website").designPublishedAt).toMatch(/^\d{4}-/);
    expect(store.get("themes/workspace").draft).toEqual(next);
  });

  it("discard puts the published design back into the draft", async () => {
    const ws = await openWorkspace(clone(store.get("settings/website")));
    await discardDraft(ws, live, ws.rev);
    expect(store.get("themes/workspace").draft).toEqual(live);
    expect(store.get("settings/website").design).toEqual(live);
  });

  it("stores each saved theme as its own document", async () => {
    const ws = await openWorkspace(clone(store.get("settings/website")));
    const added = { id: "t2", name: "Winter", design: {}, savedAt: "2026-10-08" };
    await saveSavedThemes(ws, ws.savedThemes, [added]);
    expect(store.has("savedThemes/t1")).toBe(false);
    expect(store.get("savedThemes/t2").name).toBe("Winter");
  });

  it("never falls back to saving the draft in the public document when private storage is refused", async () => {
    denyPrivate = true;
    const update = vi.spyOn(adminApi, "updateSettings");
    await expect(openWorkspace(clone(store.get("settings/website")))).rejects.toBeInstanceOf(ThemeStoreUnavailableError);
    await expect(saveDraft({ draft, rev: 0, savedThemes: [] }, { ...draft, primaryColor: "pink" }, 0)).rejects.toBeInstanceOf(ThemeStoreUnavailableError);
    expect(update).not.toHaveBeenCalled();
    expect(store.get("settings/website").draftDesign).toEqual(draft);
    update.mockRestore();
  });

  it("a tool that changes the draft before Studio was ever opened copies the older draft across first", async () => {
    await adminApi.setUnderConstruction(true);
    const ws = store.get("themes/workspace");
    expect(ws.draft).toEqual({ ...draft, showUnderConstruction: true });
    expect(ws.rev).toBe(2); // opened at 1, then the field update moved it on
    expect(store.get("savedThemes/t1").name).toBe("Spring");
  });

  it("other admin tools update the private draft and move its revision on, so an open Studio sees them", async () => {
    await openWorkspace(clone(store.get("settings/website")));
    await adminApi.setUnderConstruction(true);
    expect(store.get("settings/website").design.showUnderConstruction).toBe(true);
    expect(store.get("themes/workspace").draft.showUnderConstruction).toBe(true);
    expect(store.get("themes/workspace").rev).toBe(2);
    expect(store.get("themes/workspace")).toMatchObject({ action: "field" });
    expect(store.get("settings/website").draftDesign).toBeUndefined();
  });

  it("a Studio opened before a field update can't save or publish its older copy over it", async () => {
    const ws = await openWorkspace(clone(store.get("settings/website")));
    await adminApi.setUnderConstruction(true);
    const publish = publishDesign(ws, { ...draft, primaryColor: "navy" }, ws.rev);
    await expect(publish).rejects.toBeInstanceOf(ThemeConflictError);
    await publish.catch((e: any) => expect(e.server.draft.showUnderConstruction).toBe(true));
    expect(store.get("settings/website").design.showUnderConstruction).toBe(true);
  });

  it("creating a category from a book appends to the private draft separately from live", async () => {
    store.set("settings/website", { design: { categories: [{ id: "a", name: "Poetry" }] }, draftDesign: { categories: [{ id: "a", name: "Poetry" }, { id: "d", name: "Draft only" }] } });
    await openWorkspace(clone(store.get("settings/website")));
    await adminApi.addShopCategory({ id: "n", name: "Zines" });
    expect(store.get("settings/website").design.categories.map((c: any) => c.name)).toEqual(["Poetry", "Zines"]);
    expect(store.get("themes/workspace").draft.categories.map((c: any) => c.name)).toEqual(["Poetry", "Draft only", "Zines"]);
  });
});

