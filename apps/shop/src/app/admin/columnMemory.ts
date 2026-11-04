// Remembers the owner's column matches (plan 23.41): a heading matched once, such as "Cost to buyer" → Price, is
// matched the same way the next time a file with that heading is brought in. Kept in this browser only (a
// convenience, not shop data): another computer, a private window or cleared storage just asks again.

import { MATCHABLE_COLUMNS, type ImportField } from "./catalogImport";

const KEY = "colophon.importColumns.v1";
const MAX_KEPT = 200;
const MATCHABLE = new Set<string>(MATCHABLE_COLUMNS.map((c) => c.field));
const keyOf = (heading: string) => heading.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Everything kept, by kind of file; storage that can't be read counts as empty. */
function readStore(): Record<string, unknown> {
  try {
    const all = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

function readAll(kind: string): Record<string, ImportField> {
  try {
    const kept = readStore()[kind];
    if (!kept || typeof kept !== "object") return {};
    return Object.fromEntries(Object.entries(kept).filter(([, f]) => typeof f === "string" && MATCHABLE.has(f))) as Record<string, ImportField>;
  } catch {
    return {};
  }
}

/** The remembered match for each of these headings, keyed by the heading as the file spells it. */
export function rememberedColumns(headings: string[], kind = "books"): Record<string, ImportField> {
  const kept = readAll(kind);
  const out: Record<string, ImportField> = {};
  for (const heading of headings) {
    const field = kept[keyOf(heading)];
    if (field) out[heading] = field;
  }
  return out;
}

/**
 * Keeps the matches that were used. A heading set back to "Leave out" (in `asked` but not `chosen`) is forgotten,
 * so leaving a column out sticks too.
 */
export function rememberColumns(asked: string[], chosen: Record<string, ImportField>, kind = "books") {
  try {
    const all = readStore();
    const kept: Record<string, ImportField> = { ...readAll(kind) };
    for (const heading of asked) delete kept[keyOf(heading)];
    for (const [heading, field] of Object.entries(chosen)) if (asked.includes(heading) && MATCHABLE.has(field)) kept[keyOf(heading)] = field;
    // Newest last; the oldest go first when the list is full.
    const entries = Object.entries(kept);
    all[kind] = Object.fromEntries(entries.slice(Math.max(0, entries.length - MAX_KEPT)));
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private window or full storage: the window simply asks again next time */
  }
}
