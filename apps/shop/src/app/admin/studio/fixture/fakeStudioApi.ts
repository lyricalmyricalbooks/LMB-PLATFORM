// In-memory stand-in for the parts of `adminApi` Studio uses, so Studio can be mounted in
// tests and in the local fixture page (studio-fixture.html) without a signed-in admin or
// Firestore. Every write is recorded in `calls` so checks can assert what would have been saved.
import { DEFAULT_SETTINGS } from "../../../features/site/constants";
import { mediaApi } from "../../mediaApi";
import type { MediaItem } from "../mediaLibrary";
import { setThemeBackend, ThemeConflictError } from "../../themeStore";

export type FixtureCall = { method: string; args: any[] };
export type StudioFixture = {
  calls: FixtureCall[]; settings: any; pages: any[]; books: any[]; versions: any[]; rev: number;
  /** Studio › Media records. `mediaDenied` acts as if the media Firestore rules weren't deployed yet. */
  media: MediaItem[]; mediaDenied?: boolean;
  /** Settings › URL redirects (a page whose address changes forwards its old address). */
  redirects?: { from: string; to: string }[];
  /** Live sync (3.2): Studio's watchers, and a helper that acts like a save from another tab or device. */
  watchers?: ((remote: any) => void)[];
  /** Studio › Themes share links (previewTokens). `previewDenied` acts as if their rules weren't deployed. */
  previewLinks?: any[]; previewDenied?: boolean;
  /** Makes the next Save draft / Publish fail with this error (once), like a refused or dropped write. */
  saveError?: any;
  /** Scheduled publishes and campaigns (themeSchedule) and the scheduler's last run. */
  schedule?: any[]; schedulerLastRunAt?: string | null;
  remoteSave?: (draft: any, options?: { publish?: boolean }) => void;
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

export const FIXTURE_BOOKS = [
  { id: "b1", slug: "night-pages", title: "Night Pages", author: "A. Writer", retailPrice: 32, stockLevel: 6, status: "published", categories: ["PUBLICATIONS"], photos: [], custom: { series: "The Night Series", series_number: "2" } },
  { id: "b2", slug: "paper-weather", title: "Paper Weather", author: "B. Poet", retailPrice: 24, salePrice: 18, isOnSale: true, stockLevel: 2, status: "published", categories: ["EPHEMERA"], photos: [] },
  { id: "b3", slug: "unreleased", title: "Unreleased Draft", retailPrice: 20, stockLevel: 0, status: "draft", photos: [] },
];

/** Books › Book fields (settings/bookFields), offered by Studio's "Connect to a detail". */
export const FIXTURE_BOOK_FIELDS = [
  { key: "series", label: "Series", kind: "text" },
  { key: "series_number", label: "Number in series", kind: "number" },
];

export const FIXTURE_PAGES = [
  { id: "p1", slug: "about", title: "About", body: "<p>We publish books.</p>", status: "published", showInNav: true },
  { id: "p2", slug: "open-call", title: "Open call", body: "<p>Coming soon.</p>", status: "draft", showInNav: true },
];

// A small drawn picture (no network needed), "uploaded" at three widths.
const swatch = (w: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(w * 2 / 3)}" viewBox="0 0 3 2"><rect width="3" height="2" fill="#f2c94c"/><circle cx="1.5" cy="1" r=".6" fill="#e8402a"/></svg>`)}`;
export const FIXTURE_MEDIA: MediaItem[] = [{
  id: "m-riso-print", name: "riso-print.jpg", alt: "", focalX: 50, focalY: 50, width: 2400, height: 1600, type: "image/webp",
  bytes: 41_000 + 98_000 + 240_000, widths: [480, 960, 1600],
  variants: [
    { w: 480, h: 320, url: swatch(480), path: "assets/media/m-riso-print/1-480w.webp", bytes: 41_000 },
    { w: 960, h: 640, url: swatch(960), path: "assets/media/m-riso-print/1-960w.webp", bytes: 98_000 },
    { w: 1600, h: 1067, url: swatch(1600), path: "assets/media/m-riso-print/1-1600w.webp", bytes: 240_000 },
  ],
  createdAt: "2026-10-08T12:00:00.000Z", updatedAt: "2026-10-08T12:00:00.000Z",
}];

export function createStudioFixture(overrides: Partial<StudioFixture> = {}): StudioFixture {
  const settings = overrides.settings ?? clone({ ...DEFAULT_SETTINGS, design: (DEFAULT_SETTINGS as any).design || {} });
  if (!settings.draftDesign) settings.draftDesign = clone(settings.design);
  return {
    calls: [], rev: 0, settings, pages: clone(overrides.pages ?? FIXTURE_PAGES), books: clone(overrides.books ?? FIXTURE_BOOKS), versions: overrides.versions ?? [],
    media: clone(overrides.media ?? FIXTURE_MEDIA), mediaDenied: overrides.mediaDenied,
  };
}

/** Replace Studio's adminApi methods with in-memory ones. Returns a function that restores them. */
export function installFakeStudioApi(api: Record<string, any>, fixture: StudioFixture): () => void {
  const record = (method: string, ...args: any[]) => fixture.calls.push({ method, args: clone(args) });
  const fake: Record<string, (...args: any[]) => any> = {
    getPages: async () => clone(fixture.pages),
    getBookFields: async () => clone(FIXTURE_BOOK_FIELDS),
    getCategoryBooks: async () => clone(fixture.books),
    listThemeVersions: async () => clone(fixture.versions),
    createPreviewLink: async (design: any, name: string, days: number) => {
      if (fixture.previewDenied) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
      record("createPreviewLink", name, days);
      const link = { token: `fixtureToken${String((fixture.previewLinks || []).length + 1).padStart(14, "0")}`, name, createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(), design: clone(design) };
      fixture.previewLinks = [link, ...(fixture.previewLinks || [])];
      return { token: link.token, name, createdAt: link.createdAt, expiresAt: link.expiresAt };
    },
    listPreviewLinks: async () => {
      if (fixture.previewDenied) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
      return (fixture.previewLinks || []).map(({ design: _d, ...rest }) => rest);
    },
    getLiveDesign: async () => clone(fixture.settings.design ?? {}),
    listStoredDesigns: async () => [
      ...(fixture.schedule || []).filter(e => e.status === "scheduled" || e.status === "live").flatMap(e => [
        { label: `Scheduled › ${e.name}`, design: e.design },
        ...(e.revertDesign ? [{ label: `Scheduled › ${e.name} (the design restored when it ends)`, design: e.revertDesign }] : []),
      ]),
      ...(fixture.previewLinks || []).filter(l => Date.parse(l.expiresAt) > Date.now()).map(l => ({ label: `Share link › ${l.name}`, design: l.design })),
    ],
    listThemeSchedule: async () => (fixture.schedule || []).map(({ design: _d, ...rest }) => clone(rest)),
    addThemeSchedule: async (entry: any) => {
      record("addThemeSchedule", { kind: entry.kind, name: entry.name, startAt: entry.startAt, endAt: entry.endAt ?? null });
      const saved = { ...clone(entry), id: `sch${(fixture.schedule || []).length + 1}`, status: "scheduled", createdAt: new Date().toISOString() };
      fixture.schedule = [saved, ...(fixture.schedule || [])];
      return saved;
    },
    cancelThemeSchedule: async (id: string) => { record("cancelThemeSchedule", id); fixture.schedule = (fixture.schedule || []).map(e => (e.id === id ? { ...e, status: "cancelled" } : e)); },
    endCampaignNow: async (id: string) => { record("endCampaignNow", id); fixture.schedule = (fixture.schedule || []).map(e => (e.id === id ? { ...e, endAt: new Date().toISOString() } : e)); },
    getSchedulerStatus: async () => (fixture.schedulerLastRunAt ? { lastRunAt: fixture.schedulerLastRunAt } : null),
    revokePreviewLink: async (token: string) => { record("revokePreviewLink", token); fixture.previewLinks = (fixture.previewLinks || []).filter(l => l.token !== token); },
    saveThemeVersion: async (kind: string, label: string, design: any) => {
      record("saveThemeVersion", kind, label);
      const version = { id: `v${fixture.versions.length + 1}`, kind, label, createdAt: new Date().toISOString(), design: clone(design) };
      if (kind === "draft") fixture.versions = fixture.versions.filter(v => v.id !== "draft-latest");
      if (kind === "draft") version.id = "draft-latest";
      fixture.versions.unshift(version);
      return version;
    },
    saveThemeCheckpoint: async (name: string, design: any) => {
      record("saveThemeCheckpoint", name);
      const version = { id: `v${fixture.versions.length + 1}`, kind: "checkpoint", label: name, name, pinned: true, createdAt: new Date().toISOString(), design: clone(design) };
      fixture.versions.unshift(version);
      return clone(version);
    },
    updateThemeVersion: async (id: string, patch: any) => {
      record("updateThemeVersion", id, patch);
      fixture.versions = fixture.versions.map(v => (v.id === id ? { ...v, ...patch } : v));
      return patch;
    },
    deleteThemeVersion: async (id: string) => {
      record("deleteThemeVersion", id);
      fixture.versions = fixture.versions.filter(v => v.id !== id);
    },
    createPage: async (page: any) => { record("createPage", page); const created = { ...page, id: `p${fixture.pages.length + 1}` }; fixture.pages.push(created); return created; },
    updatePage: async (id: string, page: any) => { record("updatePage", id, page); fixture.pages = fixture.pages.map(p => p.id === id ? { ...p, ...page } : p); return clone(fixture.pages.find(p => p.id === id)); },
    deletePage: async (id: string) => { record("deletePage", id); fixture.pages = fixture.pages.filter(p => p.id !== id); },
    getRedirects: async () => clone(fixture.redirects || []),
    saveRedirects: async (items: any[]) => { record("saveRedirects", items); fixture.redirects = clone(items); return clone(items); },
    updateCategoryBooks: async (...args: any[]) => { record("updateCategoryBooks", ...args); return []; },
    uploadFile: async (_file: File, path: string) => { record("uploadFile", path); return `https://example.invalid/${path}`; },
    updateShopCategories: async (categories: any[]) => { record("updateShopCategories", categories); },
  };
  const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
  const fakeMedia: Record<string, (...args: any[]) => any> = {
    list: async () => { if (fixture.mediaDenied) throw denied(); return clone(fixture.media); },
    save: async (item: MediaItem) => {
      if (fixture.mediaDenied) throw denied();
      record("saveMedia", item);
      fixture.media = [clone(item), ...fixture.media.filter(m => m.id !== item.id)];
    },
    remove: async (item: MediaItem, paths: string[]) => { record("removeMedia", item.id, paths); fixture.media = fixture.media.filter(m => m.id !== item.id); },
    removeFiles: async (paths: string[]) => { if (paths.length) record("removeMediaFiles", paths); },
  };
  const originals: Record<string, any> = {};
  for (const [name, fn] of Object.entries(fake)) { originals[name] = api[name]; api[name] = fn; }
  // Studio's draft store (admin/themeStore.ts): Save draft, Publish and Discard are recorded as
  // `saveDesign` with ({ design }, { publish }), the shape checks assert on.
  const restoreBackend = setThemeBackend({
    open: async () => ({ draft: clone(fixture.settings.draftDesign), rev: fixture.rev, savedThemes: clone(fixture.settings.savedThemes || []) }),
    write: async (expectedRev, draft, live) => {
      if (fixture.saveError) { const error = fixture.saveError; fixture.saveError = undefined; throw error; }
      if (expectedRev !== fixture.rev) throw new ThemeConflictError({ draft: clone(fixture.settings.draftDesign), rev: fixture.rev });
      record("saveDesign", { design: draft }, { publish: Boolean(live) });
      fixture.settings.draftDesign = clone(draft);
      if (live) fixture.settings.design = clone(live);
      return ++fixture.rev;
    },
    saveThemes: async (_previous, next) => { record("saveThemes", next); fixture.settings.savedThemes = clone(next); },
    fieldUpdate: async fields => {
      record("draftFieldUpdate", fields);
      Object.assign(fixture.settings.draftDesign, clone(fields));
      // Like the real store: a field update moves the revision on, so open Studios follow it.
      const remote = { draft: clone(fixture.settings.draftDesign), rev: ++fixture.rev, tabId: "another-tab", updatedAt: new Date().toISOString(), published: false };
      for (const watcher of fixture.watchers || []) watcher(clone(remote));
    },
    readField: async key => clone(fixture.settings.draftDesign?.[key]),
    watch: onChange => {
      fixture.watchers = [...(fixture.watchers || []), onChange];
      return () => { fixture.watchers = (fixture.watchers || []).filter(w => w !== onChange); };
    },
  });
  fixture.remoteSave = (draft, options = {}) => {
    fixture.settings.draftDesign = clone(draft);
    if (options.publish) fixture.settings.design = clone(draft);
    const remote = { draft: clone(draft), rev: ++fixture.rev, tabId: "another-tab", updatedAt: new Date().toISOString(), published: Boolean(options.publish) };
    for (const watcher of fixture.watchers || []) watcher(clone(remote));
  };
  const media = mediaApi as Record<string, any>;
  const mediaOriginals: Record<string, any> = {};
  for (const [name, fn] of Object.entries(fakeMedia)) { mediaOriginals[name] = media[name]; media[name] = fn; }
  return () => {
    restoreBackend();
    for (const [name, fn] of Object.entries(originals)) api[name] = fn;
    for (const [name, fn] of Object.entries(mediaOriginals)) media[name] = fn;
  };
}
