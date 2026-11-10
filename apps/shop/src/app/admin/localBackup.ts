// Back up to a folder on this computer (Settings › General › Back up to a folder). The press picks a folder once; the
// browser keeps the permission to it. Each backup is a dated sub-folder holding the same files as Download your shop,
// the newest KEEP kept. Chrome and Edge only (File System Access); other browsers use the zip. The shop's own cloud
// backup runs every night regardless; this is a second copy. One audit-log line per backup, read by the control room.
import { adminApi } from "./api";
import { buildTakeout, type TakeoutStep } from "./takeoutRun";

export const KEEP = 7;
export const DUE_HOURS = 20;
const PREFIX = "shop-backup-";
const DB = "lm-local-backup";
const META = "lm:local-backup";

export const supported = () => typeof window !== "undefined" && typeof (window as any).showDirectoryPicker === "function";

// ── Pure rules ──

export const folderNameFor = (date: Date) => `${PREFIX}${date.toISOString().slice(0, 10)}`;
/** The dated folders to delete so only the newest `keep` stay. Anything not named like ours is never touched. */
export const oldFolders = (names: string[], keep = KEEP) => names.filter((n) => new RegExp(`^${PREFIX}\\d{4}-\\d{2}-\\d{2}$`).test(n)).sort().reverse().slice(keep);
export const dueForBackup = (lastAt: string | null | undefined, now = new Date()) => !lastAt || now.getTime() - Date.parse(lastAt) >= DUE_HOURS * 3600_000;

// ── What this browser remembers (the folder itself in IndexedDB; the plain facts in localStorage) ──

export interface LocalMeta { auto: boolean; lastAt: string | null; lastSummary: string | null; folder: string | null }
export function readMeta(): LocalMeta {
  try { return { auto: false, lastAt: null, lastSummary: null, folder: null, ...JSON.parse(localStorage.getItem(META) || "{}") }; } catch { return { auto: false, lastAt: null, lastSummary: null, folder: null }; }
}
export function writeMeta(patch: Partial<LocalMeta>) {
  try { localStorage.setItem(META, JSON.stringify({ ...readMeta(), ...patch })); } catch { /* private window: nothing remembered */ }
}
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore("h");
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const idb = async <T,>(mode: IDBTransactionMode, make: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((resolve, reject) => { const r = make(db.transaction("h", mode).objectStore("h")); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
};
export const savedFolder = async (): Promise<FileSystemDirectoryHandle | null> => { try { return (await idb("readonly", (s) => s.get("folder"))) ?? null; } catch { return null; } };
export async function chooseFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({ id: "colophon-backup", mode: "readwrite" });
  await idb("readwrite", (s) => s.put(handle, "folder"));
  writeMeta({ folder: handle.name });
  return handle;
}
export async function forgetFolder() {
  try { await idb("readwrite", (s) => s.delete("folder")); } catch { /* nothing saved */ }
  writeMeta({ folder: null, auto: false });
}

/** True when the browser still lets us write there; `ask` may show the browser's own prompt (needs a click). */
export async function canWrite(handle: any, ask: boolean): Promise<boolean> {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  return ask ? (await handle.requestPermission?.(opts)) === "granted" : false;
}

// ── Writing ──

type Dir = FileSystemDirectoryHandle;
async function writeFile(root: Dir, path: string, content: string | Uint8Array) {
  const parts = path.split("/");
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
  const file = await dir.getFileHandle(parts.at(-1)!, { create: true });
  const out = await (file as any).createWritable();
  await out.write(content);
  await out.close();
}

/** Writes today's backup folder (replacing one made earlier the same day) and removes the oldest beyond KEEP. */
export async function writeBackup(root: Dir, files: { path: string; content: string | Uint8Array }[], now = new Date()) {
  const name = folderNameFor(now);
  try { await (root as any).removeEntry(name, { recursive: true }); } catch { /* none yet */ }
  const today = await root.getDirectoryHandle(name, { create: true });
  for (const f of files) await writeFile(today, f.path, f.content);
  const names: string[] = [];
  for await (const [entry] of (root as any).entries()) names.push(entry);
  for (const old of oldFolders(names)) { try { await (root as any).removeEntry(old, { recursive: true }); } catch { /* in use: next time */ } }
  return name;
}

/** One backup: reads the shop, writes the folder, records it. Throws if the folder can't be written. */
export async function backUpNow(handle: Dir, onStep: (s: TakeoutStep) => void = () => {}, now = new Date()): Promise<string> {
  const { files, summary, detail } = await buildTakeout(onStep);
  onStep({ label: "Saving to your folder…" });
  await writeBackup(handle, files, now);
  writeMeta({ lastAt: now.toISOString(), lastSummary: summary });
  await adminApi.recordAuditLog("export", `Backed up to a folder on the computer: ${detail}`).catch(() => {});
  return summary;
}
