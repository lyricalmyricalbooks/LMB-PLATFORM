// Back up to a folder: the pure rules, and a pretend folder that takes the files, replaces a same-day backup and keeps
// only the newest seven of our own dated folders.
import { describe, expect, it } from "vitest";
import { KEEP, dueForBackup, folderNameFor, oldFolders, writeBackup } from "./localBackup";

class Dir {
  dirs = new Map<string, Dir>();
  files = new Map<string, string>();
  async getDirectoryHandle(name: string, o?: { create?: boolean }) { if (!this.dirs.has(name)) { if (!o?.create) throw new Error("missing"); this.dirs.set(name, new Dir()); } return this.dirs.get(name)!; }
  async getFileHandle(name: string) { return { createWritable: async () => ({ write: async (c: any) => { this.files.set(name, typeof c === "string" ? c : `bytes:${c.length}`); }, close: async () => {} }) }; }
  async removeEntry(name: string) { if (!this.dirs.delete(name) && !this.files.delete(name)) throw new Error("missing"); }
  async *entries() { for (const k of this.dirs.keys()) yield [k, this.dirs.get(k)]; for (const k of this.files.keys()) yield [k, null]; }
}

describe("local backup rules", () => {
  it("names the folder by day and decides when one is due", () => {
    expect(folderNameFor(new Date("2026-11-10T20:00:00Z"))).toBe("shop-backup-2026-11-10");
    const now = new Date("2026-11-10T20:00:00Z");
    expect(dueForBackup(null, now)).toBe(true);
    expect(dueForBackup("2026-11-10T10:00:00Z", now)).toBe(false);
    expect(dueForBackup("2026-11-09T10:00:00Z", now)).toBe(true);
  });
  it("only ever removes our own dated folders, oldest first", () => {
    const names = ["photos", "notes.txt", ...Array.from({ length: 9 }, (_, i) => `shop-backup-2026-11-0${i + 1}`)];
    expect(oldFolders(names)).toEqual(["shop-backup-2026-11-02", "shop-backup-2026-11-01"]);
    expect(oldFolders(names, KEEP).includes("photos")).toBe(false);
  });
});

describe("writing a backup", () => {
  it("writes nested files, replaces the same day, keeps seven and leaves other folders alone", async () => {
    const root = new Dir();
    await root.getDirectoryHandle("my-own-stuff", { create: true });
    for (let d = 1; d <= 8; d++) await writeBackup(root as any, [{ path: "README.txt", content: "a" }, { path: "products/shopify-products.csv", content: `day${d}` }, { path: "images/x.jpg", content: new Uint8Array([1, 2]) }], new Date(`2026-11-0${d}T12:00:00Z`));
    await writeBackup(root as any, [{ path: "README.txt", content: "again" }], new Date("2026-11-08T18:00:00Z"));
    const names = [...root.dirs.keys()].sort();
    expect(names).toEqual(["my-own-stuff", ...Array.from({ length: 7 }, (_, i) => `shop-backup-2026-11-0${i + 2}`)]);
    const last = root.dirs.get("shop-backup-2026-11-08")!;
    expect(last.files.get("README.txt")).toBe("again");
    expect(last.dirs.has("products")).toBe(false);
    expect(root.dirs.get("shop-backup-2026-11-07")!.dirs.get("images")!.files.get("x.jpg")).toBe("bytes:2");
  });
});
