// Studio's private storage. The unpublished draft and My themes live in admin-only documents
// (themes/workspace, savedThemes/*) instead of the public settings/website document that every
// shopper downloads. Saves are compare-and-set on a revision number, so two tabs (or devices)
// can't silently overwrite each other's work.
//
// The rules for these paths are deployed, so there is no fallback to the old public
// settings/website.draftDesign field any more: the first open copies an older public draft (and
// My themes) across once, then removes the public copies. If the private documents can't be
// read, Studio says so instead of saving drafts where shoppers can download them.
import { deleteField, doc, getDoc, collection, getDocs, onSnapshot, runTransaction, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { auditLog } from "./auditLog";
import { sameDesign } from "./studio/studioModel";

export type Workspace = { draft: any; rev: number; savedThemes: any[] };
/** The working copy as another tab or device just saved it (Studio 3.2 live sync). */
export type RemoteWorkspace = { draft: any; rev: number; tabId?: string; updatedAt?: string; published?: boolean };

/** Thrown when another tab or device saved the draft since this Studio loaded it. */
export class ThemeConflictError extends Error {
  constructor(public server: { draft: any; rev: number }) {
    super("The design was saved from another tab or device.");
    this.name = "ThemeConflictError";
  }
}

/** Thrown when the private draft documents can't be read or written (rules not deployed, signed out). */
export class ThemeStoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Studio's private draft storage isn't available. Check that you're signed in as the shop admin.");
    this.name = "ThemeStoreUnavailableError";
    (this as any).cause = cause;
  }
}

const SETTINGS = () => doc(db, "settings", "website");
const WORKSPACE = () => doc(db, "themes", "workspace");
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
const denied = (error: any) => error?.code === "permission-denied" || /insufficient permissions/i.test(String(error?.message || ""));
const unavailable = (error: unknown) => denied(error) ? new ThemeStoreUnavailableError(error) : error;
const now = () => new Date().toISOString();

let tabId = "";
export function studioTabId() {
  if (tabId) return tabId;
  try { tabId = sessionStorage.getItem("studio-tab-id") || ""; } catch { /* storage blocked */ }
  if (!tabId) {
    tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tab-${Date.now().toString(36)}`;
    try { sessionStorage.setItem("studio-tab-id", tabId); } catch { /* storage blocked */ }
  }
  return tabId;
}

/**
 * Where Studio keeps its draft. Firestore in the app; the Studio fixture and tests swap in an
 * in-memory one (`setThemeBackend`) so they can check exactly what would have been saved.
 */
export type ThemeBackend = {
  open(settings: any): Promise<Workspace>;
  /** Compare-and-set the draft (and, for Publish, the live design). Returns the new revision. */
  write(expectedRev: number, draft: any, live?: any): Promise<number>;
  saveThemes(previous: any[], next: any[]): Promise<void>;
  /** Change single draft fields (categories, the under-construction wall). Moves the revision on so open Studios see it. */
  fieldUpdate(fields: Record<string, any>): Promise<void>;
  readField(key: string): Promise<any>;
  /** Live updates of the working copy (Studio 3.2). Returns an unsubscribe function. Optional. */
  watch?(onChange: (remote: RemoteWorkspace) => void, onError?: (error: unknown) => void): () => void;
};

async function readSavedThemes(): Promise<any[]> {
  const snap = await getDocs(collection(db, "savedThemes"));
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

/**
 * Open the private working copy. When it doesn't exist yet, an older draft / My themes still in
 * the public settings document are copied across once, checked, and only then removed there.
 */
async function openFirestore(settings: any): Promise<Workspace> {
  const olderDraft = settings?.draftDesign ?? settings?.design ?? {};
  const olderThemes = Array.isArray(settings?.savedThemes) ? settings.savedThemes : [];
  try {
    let snap: any = await getDoc(WORKSPACE());
    if (!snap.exists()) {
      await runTransaction(db, async tx => {
        const current = await tx.get(WORKSPACE());
        if (!current.exists()) tx.set(WORKSPACE(), { draft: clone(olderDraft), rev: 1, updatedAt: now(), tabId: studioTabId(), migratedAt: now() });
      });
      if (olderThemes.length) {
        const batch = writeBatch(db);
        for (const theme of olderThemes) if (theme?.id) batch.set(doc(db, "savedThemes", String(theme.id)), clone(theme));
        await batch.commit();
      }
      snap = await getDoc(WORKSPACE());
    }
    const data: any = snap.data() || {};
    let savedThemes = await readSavedThemes().catch(() => olderThemes);
    // Remove the public copies only once the private ones hold the same content.
    const copiedThemes = olderThemes.every((t: any) => savedThemes.some((s: any) => s.id === t.id));
    if ((settings?.draftDesign !== undefined || olderThemes.length) && sameDesign(data.draft, olderDraft) && copiedThemes) {
      await setDoc(SETTINGS(), { draftDesign: deleteField(), savedThemes: deleteField() }, { mergeFields: ["draftDesign", "savedThemes"] }).catch(() => {});
    } else if (!savedThemes.length && olderThemes.length) savedThemes = olderThemes;
    return { draft: data.draft ?? olderDraft, rev: Number(data.rev) || 0, savedThemes };
  } catch (error) { throw unavailable(error); }
}

/** A field-path write needs the workspace to exist first, or it would start a draft with only that field. */
async function ensureWorkspace() {
  const snap: any = await getDoc(WORKSPACE());
  if (snap.exists()) return;
  const settings: any = (await getDoc(SETTINGS())).data() || {};
  await openFirestore(settings);
}

const firestoreBackend: ThemeBackend = {
  open: openFirestore,
  async write(expectedRev, draft, live) {
    let next = expectedRev;
    try {
      await runTransaction(db, async tx => {
        const current: any = (await tx.get(WORKSPACE())).data() || {};
        const rev = Number(current.rev) || 0;
        if (rev !== expectedRev) throw new ThemeConflictError({ draft: current.draft, rev });
        next = rev + 1;
        if (live) tx.set(SETTINGS(), { design: live, designPublishedAt: now() }, { mergeFields: ["design", "designPublishedAt"] });
        tx.set(WORKSPACE(), { draft, rev: next, updatedAt: now(), tabId: studioTabId(), action: live ? "publish" : "save" });
      });
    } catch (error) { throw unavailable(error); }
    return next;
  },
  async saveThemes(previous, next) {
    const batch = writeBatch(db);
    const before = new Map(previous.map(t => [t.id, JSON.stringify(t)]));
    for (const theme of next) if (before.get(theme.id) !== JSON.stringify(theme)) batch.set(doc(db, "savedThemes", String(theme.id)), clone(theme));
    for (const theme of previous) if (!next.some(t => t.id === theme.id)) batch.delete(doc(db, "savedThemes", String(theme.id)));
    try { await batch.commit(); } catch (error) { throw unavailable(error); }
  },
  async fieldUpdate(fields) {
    try {
      await ensureWorkspace();
      // One transaction: the field and a new revision land together, so another open Studio is told (its live sync
      // sees a newer revision) and its next Save / Publish can't silently put the old value back.
      await runTransaction(db, async tx => {
        const current: any = (await tx.get(WORKSPACE())).data() || {};
        const nested: any = { draft: {}, rev: (Number(current.rev) || 0) + 1, updatedAt: now(), tabId: studioTabId(), action: "field" };
        for (const [k, v] of Object.entries(fields)) nested.draft[k] = v;
        tx.set(WORKSPACE(), nested, { mergeFields: [...Object.keys(fields).map(k => `draft.${k}`), "rev", "updatedAt", "tabId", "action"] });
      });
    } catch (error) { throw unavailable(error); }
  },
  async readField(key) {
    try {
      await ensureWorkspace();
      const snap: any = await getDoc(WORKSPACE());
      return snap.data()?.draft?.[key];
    } catch (error) { throw unavailable(error); }
  },
  watch(onChange, onError) {
    return onSnapshot(WORKSPACE(), (snap: any) => {
      // Our own field-path writes show up first as local, unconfirmed changes: wait for the server copy.
      if (snap.metadata?.hasPendingWrites) return;
      const data: any = snap.data();
      if (!data) return;
      onChange({ draft: data.draft, rev: Number(data.rev) || 0, tabId: data.tabId, updatedAt: data.updatedAt, published: data.action === "publish" });
    }, error => onError?.(unavailable(error)));
  },
};

let backend: ThemeBackend = firestoreBackend;
/** Swap the storage (Studio fixture and tests). Returns a function that restores the previous one. */
export function setThemeBackend(next: ThemeBackend): () => void {
  const previous = backend; backend = next;
  return () => { backend = previous; };
}

/** Open Studio's working copy (draft, revision, My themes). */
export function openWorkspace(settings: any): Promise<Workspace> { return backend.open(settings); }

/**
 * Follow the working copy while Studio is open, so a save from another tab or device shows up at once
 * instead of only as a conflict on the next save. Backends without live updates return a no-op.
 */
export function watchWorkspace(onChange: (remote: RemoteWorkspace) => void, onError?: (error: unknown) => void): () => void {
  return backend.watch ? backend.watch(onChange, onError) : () => {};
}

/** Save draft. Returns the new revision. Throws ThemeConflictError when another tab saved first. */
export async function saveDraft(_ws: Workspace, design: any, expectedRev: number): Promise<number> {
  return backend.write(expectedRev, clone(design));
}

/** Publish: the live design and the draft change together in one transaction. */
export async function publishDesign(_ws: Workspace, design: any, expectedRev: number): Promise<number> {
  const snapshot = clone(design);
  const rev = await backend.write(expectedRev, snapshot, snapshot);
  await auditLog.record("settings", "Published the Studio design").catch(() => {});
  return rev;
}

/** Discard draft: the working copy goes back to the published design. */
export async function discardDraft(_ws: Workspace, published: any, expectedRev: number): Promise<number> {
  const rev = await backend.write(expectedRev, clone(published));
  await auditLog.record("settings", "Discarded unpublished theme changes").catch(() => {});
  return rev;
}

/** Store My themes. Only themes that changed are written; removed ones are deleted. */
export function saveSavedThemes(_ws: Workspace, previous: any[], next: any[]): Promise<void> {
  return backend.saveThemes(previous, next);
}

/**
 * Field-path write for admin tools that change one design field outside Studio (shop categories,
 * the under-construction wall). Keeps the draft in step and bumps the revision, so an open Studio
 * follows it (live sync) instead of later saving or publishing its older copy over the new value.
 */
export function draftFieldUpdate(fields: Record<string, any>) { return backend.fieldUpdate(fields); }

/** Read the current draft value of one field (for transactions that append to it). */
export function readDraftField(key: string, _settingsData?: any): Promise<any> { return backend.readField(key); }
