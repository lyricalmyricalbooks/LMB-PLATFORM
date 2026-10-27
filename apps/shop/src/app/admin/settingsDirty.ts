// Settings-wide unsaved-changes registry. Each Settings section or child editor (General,
// Payments, Taxes, Notifications, a shipping profile, Local fulfillment…) registers a
// "has unsaved edits?" check; Dashboard asks anyDirty() before leaving Settings and the
// beforeunload guard uses it too. Pure apart from the module-level map; tested.
import { useEffect, useRef } from "react";

const checks = new Map<string, () => boolean>();

/** Register (or replace) a check. Returns the unregister function. */
export function registerDirty(key: string, isDirty: () => boolean): () => void {
  checks.set(key, isDirty);
  return () => { if (checks.get(key) === isDirty) checks.delete(key); };
}

/** Keys of every registered section with unsaved edits. */
export function dirtyKeys(): string[] {
  const out: string[] = [];
  for (const [key, check] of checks) {
    try { if (check()) out.push(key); } catch { /* a broken check never blocks navigation */ }
  }
  return out;
}

export function anyDirty(): boolean {
  return dirtyKeys().length > 0;
}

/** Test helper. */
export function clearDirty() {
  checks.clear();
}

/** Component hook: registers `dirty` (latest value) under `key` while mounted. */
export function useSettingsDirty(key: string, dirty: boolean) {
  const ref = useRef(dirty);
  ref.current = dirty;
  useEffect(() => registerDirty(key, () => ref.current), [key]);
}

/** Adds a beforeunload prompt while anything is dirty (mounted once by Dashboard). */
export function useBeforeUnloadWhenDirty() {
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!anyDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
}
