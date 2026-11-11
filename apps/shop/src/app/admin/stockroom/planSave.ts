// The pure heart of saving a stockroom item: given what this page started from (base), what the cloud holds now
// (remote) and what the page wants to save (local), work out what to write. No database, no clock, no page; the
// writer (stockroomWrite.ts) feeds it and commits the answer.
//
// The merge rules are the stockroom's own (`@stockroom/merge-state.js`, the same functions its `_fbSave` calls); this
// file only decides WHEN to merge and what to write, and follows `_fbSave` step for step, with these differences:
//  - every part is compared with the cloud, not only the ones this page changed. `_fbSave` reads only the changed
//    parts, then recomputes `after`/stock on the whole merged state, which can rewrite a part it never read and put a
//    stale copy over another device's rows. Here a part another device changed is taken in even when this page left it
//    alone, so the totals are worked out from the rows the cloud really holds.
//  - a part that cannot be read is an error (`UnreadablePartError`), never "empty": treating a damaged record as empty
//    would let the next write replace it.
import { ALL_PARTS, emptyPart, mergePart, splitState, stitchState } from "@stockroom/merge-state.js";
import { deriveOnHand } from "@stockroom/inventory.js";

export type BookState = Record<string, unknown>;
/** One part's stored text (`JSON.stringify` of the part), `null`/missing when the part has no document. */
export type PartTexts = Record<string, string | null | undefined>;
export type SaveConflict = { part: string; key?: string; local?: unknown; remote?: unknown };
export type BookLike = { id?: unknown; maxPrint?: unknown; [key: string]: unknown };

export class UnreadablePartError extends Error {
  readonly part: string;
  constructor(part: string, cause?: unknown) {
    super(`The stored "${part}" record could not be read, so nothing was changed.`);
    this.name = "UnreadablePartError";
    this.part = part;
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * The values the stockroom derives from a book's rows. This write layer sets the on-hand count (`stock`, from the
 * stockroom's `deriveOnHand`) exactly as `recomputeAfters` does for a book with a print run. The rest of
 * `recomputeAfters` (revenue and channel totals, store tallies, each row's running `after`) lives in `main.js`, which
 * cannot be imported; a page that changes rows those depend on passes its own `derive` (see WRITING.md).
 */
export type Derive = (state: BookState, book: BookLike | null) => void;
export const deriveStock: Derive = (state, book) => {
  if (book && Number.isFinite(book.maxPrint)) state.stock = deriveOnHand(state, book as Record<string, unknown>);
};

const emptyText = (part: string) => JSON.stringify(emptyPart(part));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function parsePart(part: string, text: string): unknown {
  try { return JSON.parse(text); } catch (error) { throw new UnreadablePartError(part, error); }
}

/** A book's parts as the text that is stored, the form the merge base and the cloud copy are compared in. */
export function partTextsOf(state: BookState): Record<string, string> {
  const parts = splitState(state);
  const out: Record<string, string> = {};
  for (const name of ALL_PARTS) out[name] = JSON.stringify(parts[name]);
  return out;
}

export type SavePlan = {
  /** The book as it is after the save: the merged rows with derived values recomputed. Pages adopt this. */
  state: BookState;
  /** Part name -> the text to store. Empty when the cloud already holds the answer. */
  writes: Record<string, string>;
  /** True when another device had changed something since the page read, and the two were merged. */
  merged: boolean;
  /** Rows both devices changed. The page's version was kept; the other device's version is in `remote`. */
  conflicts: SaveConflict[];
};

export type PlanInput = {
  /** What the page started from, part by part (a missing part = the page never read it). */
  base: PartTexts;
  /** What the cloud holds now, part by part (missing/null = no document). */
  remote: PartTexts;
  /** What the page wants to save. Not changed. */
  local: BookState;
  book?: BookLike | null;
  derive?: Derive;
};

export function planSave({ base, remote, local, book = null, derive = deriveStock }: PlanInput): SavePlan {
  // Derived values (the on-hand count) are set before anything is compared, so the stored count always agrees with
  // the stored rows; the page's own object is never touched.
  const wanted = clone(local);
  derive(wanted, book);
  const localParts = splitState(wanted);

  const merged: Record<string, unknown> = {};
  const conflicts: SaveConflict[] = [];
  let didMerge = false;

  for (const part of ALL_PARTS) {
    const baseText = base[part] ?? null;
    const remoteText = remote[part] ?? emptyText(part);
    if (remoteText === baseText) { merged[part] = localParts[part]; continue; } // nobody else touched it
    // The cloud moved on. An unknown base (the page never read this part) is treated as empty and flagged unknown,
    // which makes the merge a union: it may keep a row the other device deleted, but never drops a row or counts a
    // sale both sides hold twice (the same rule `_fbSave` states).
    didMerge = true;
    const result = mergePart(
      part,
      baseText != null ? parsePart(part, baseText) : emptyPart(part),
      parsePart(part, remoteText),
      localParts[part],
      { baseKnown: baseText != null },
    );
    merged[part] = result.value;
    conflicts.push(...result.conflicts);
  }

  const state = stitchState(merged);
  // Rows from two devices are interleaved now, so the derived values are worked out again from the combined rows.
  if (didMerge) derive(state, book);

  const writes: Record<string, string> = {};
  const finalTexts = partTextsOf(state);
  for (const part of ALL_PARTS) {
    if (finalTexts[part] !== (remote[part] ?? emptyText(part))) writes[part] = finalTexts[part];
  }
  return { state, writes, merged: didMerge, conflicts };
}
