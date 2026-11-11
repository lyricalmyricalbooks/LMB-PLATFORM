// Types for the stockroom's save rules the write layer imports through the `@stockroom` alias. These declarations add
// to the ones in stockroomLib.d.ts (ambient modules merge), so each file lists only what its own code uses.
declare module "@stockroom/merge-state.js" {
  export const ALL_PARTS: string[];
  export const MERGED_SETTING_KEYS: Set<string>;
  export function emptyPart(name: string): unknown;
  export function splitState(state: unknown): Record<string, unknown>;
  export function mergePart(
    part: string, base: unknown, remote: unknown, local: unknown, opts?: { baseKnown?: boolean },
  ): { value: unknown; conflicts: Array<{ part: string; key?: string; local?: unknown; remote?: unknown }> };
  export function mergeSettingDoc(
    baseJson: string | null, remoteJson: string | null, local: unknown,
  ): { value: unknown; merged: boolean; conflicts: Array<{ part: string; key?: string; local?: unknown; remote?: unknown }> };
}
declare module "@stockroom/bookkeeper-copy.js" {
  export const BOOKKEEPER_COPY_KEY: string;
  export function bookkeeperTaxCopy(taxCenter: unknown, at?: string): Record<string, unknown>;
  export function bookkeeperCopyKey(copy: unknown): string;
}
declare module "@stockroom/book-size.js" {
  export function bookSizeReport(
    state: unknown, opts?: { firestore?: boolean; json?: string | null },
  ): { level: "ok" | "warn" | "over"; part: string | null; bytes: number; limit: number; share: number };
  export function bookSizeMessage(report: unknown, title: string): string;
}
declare module "@stockroom/recompute-afters.js" {
  /** The stockroom's rebuild of everything derived from an item's rows (totals, store counters, stock, running `after`). */
  export function recomputeAfters(state: Record<string, unknown>, book: Record<string, unknown> | null): void;
}
