// An in-memory stockroom for tests and the admin fixture: the same records in the same shapes as the real database
// (per-part texts, whole-book text in the older store, settings as text), with the commit behaviour the writer relies
// on (each commit sees what is stored at that moment and applies all its writes or none).
//
// `device()` hands out one device's view; several devices share the same records, which is how two devices editing the
// same book are tested. Hooks let a test run another device's write between this device's read and its commit.
import { ALL_PARTS, splitState } from "@stockroom/merge-state.js";

import type { StockroomIO } from "./stockroomWrite";

export type DeviceOptions = {
  /** Staff and other non-owners: every call is refused, as the rules refuse them. */
  role?: "owner" | "staff";
  /** Every call fails as an unreachable server does. */
  offline?: boolean;
  /** Runs inside a commit just before it looks at what is stored (another device "writes in between"). */
  beforeCommit?: (kind: "book" | "oldBook" | "setting" | "oldSetting", id: string) => void;
  /** A commit that fails after deciding, before anything is applied (the all-or-nothing case). */
  failCommit?: Error;
};

export class MemoryStockroom {
  parts = new Map<string, Record<string, string>>();
  oldBooks = new Map<string, string>();
  settings = new Map<string, string>();
  oldSettings = new Map<string, string>();
  flags: Record<string, unknown> = {};
  planDoc: Record<string, unknown> | null = null;
  /** Every applied write, in order. */
  log: Array<{ kind: string; id: string; parts?: string[] }> = [];

  /** Store a book the way the old app does: one text per part. */
  putBook(bookId: string, state: Record<string, unknown>, mode: "parts" | "old" = "parts") {
    if (mode === "old") { this.oldBooks.set(bookId, JSON.stringify(state)); return; }
    const split = splitState(state);
    const stored: Record<string, string> = {};
    for (const part of ALL_PARTS) stored[part] = JSON.stringify(split[part]);
    this.parts.set(bookId, stored);
    this.flags[`fs_mode_${bookId}`] = true;
  }

  putCatalog(books: Array<Record<string, unknown>>) {
    const catalog: Record<string, unknown> = {};
    for (const book of books) catalog[String(book.id)] = book;
    this.flags.fs_mode_global = true;
    this.settings.set("catalog", JSON.stringify(catalog));
  }

  device(options: DeviceOptions = {}): StockroomIO {
    const gate = () => {
      if (options.offline) throw Object.assign(new Error("The client is offline."), { code: "unavailable" });
      if (options.role === "staff") throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    };
    const commitGate = (kind: Parameters<NonNullable<DeviceOptions["beforeCommit"]>>[0], id: string) => {
      gate();
      options.beforeCommit?.(kind, id);
    };
    const failIfAsked = () => { if (options.failCommit) throw options.failCommit; };
    return {
      setting: async (key) => { gate(); return this.settings.get(key) ?? null; },
      oldSetting: async (key) => { gate(); return this.oldSettings.get(key) ?? null; },
      flags: async () => { gate(); return { ...this.flags }; },
      bookParts: async (bookId) => { gate(); return { ...(this.parts.get(bookId) ?? {}) }; },
      oldBook: async (bookId) => { gate(); return this.oldBooks.get(bookId) ?? null; },
      plan: async () => { gate(); return this.planDoc ? { ...this.planDoc } : null; },
      commitBookParts: async (bookId, decide) => {
        commitGate("book", bookId);
        const current = this.parts.get(bookId) ?? {};
        const stored: Record<string, string | null> = {};
        for (const part of ALL_PARTS) stored[part] = current[part] ?? null;
        const writes = decide(stored);
        failIfAsked();
        if (!writes) return;
        this.parts.set(bookId, { ...current, ...writes });
        this.log.push({ kind: "book", id: bookId, parts: Object.keys(writes) });
      },
      commitOldBook: async (bookId, decide) => {
        commitGate("oldBook", bookId);
        const next = decide(this.oldBooks.get(bookId) ?? null);
        failIfAsked();
        if (next == null) return;
        this.oldBooks.set(bookId, next);
        this.log.push({ kind: "oldBook", id: bookId });
      },
      commitSetting: async (key, decide) => {
        commitGate("setting", key);
        const next = decide(this.settings.get(key) ?? null);
        failIfAsked();
        if (next == null) return;
        this.settings.set(key, next);
        this.log.push({ kind: "setting", id: key });
      },
      commitOldSetting: async (key, decide) => {
        commitGate("oldSetting", key);
        const next = decide(this.oldSettings.get(key) ?? null);
        failIfAsked();
        if (next == null) return;
        this.oldSettings.set(key, next);
        this.log.push({ kind: "oldSetting", id: key });
      },
    };
  }
}
