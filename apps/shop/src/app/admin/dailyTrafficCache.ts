// The Overview reads every daily traffic doc (analytics/<UTC day>) of its range and comparison window: ~60 docs for
// 30 days, ~730 for a year-on-year view. Days that can no longer be written (firestore.rules lets browsers write a
// day only within a day of it) never change again, so they are kept for the admin session and only the last few
// days are read again. "Start traffic counts again" deletes the docs: call forgetDailyTraffic() after it.

type Row = { id: string; date?: string; [key: string]: any };
type Fetch = (fromKey: string, toKey: string) => Promise<Row[]>;

/** Days before this one (UTC) are final: no browser may write them any more. */
export const SETTLE_DAYS = 3;

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const prevDay = (key: string) => dayKey(Date.parse(`${key}T00:00:00Z`) - 86_400_000);
const nextDay = (key: string) => dayKey(Date.parse(`${key}T00:00:00Z`) + 86_400_000);

let known: { from: string; to: string; rows: Map<string, Row> } | null = null;

let generation = 0;

export function forgetDailyTraffic() { known = null; generation += 1; }

/**
 * The same rows `fetch(fromKey, toKey)` returns (sorted by date), reading only what isn't settled and on hand.
 * `known` is one unbroken stretch of settled days whose docs were all read (a day with no doc is simply absent).
 */
export async function dailyTrafficBetween(fromKey: string, toKey: string, fetch: Fetch, now = Date.now()): Promise<Row[]> {
  const gen = generation;
  const lastSettled = dayKey(now - SETTLE_DAYS * 86_400_000);
  const settledTo = toKey < lastSettled ? toKey : lastSettled;
  const inside = (r: Row) => { const d = String(r.date || r.id); return d >= fromKey && d <= toKey; };
  // Nothing settled asked for, or the settled part isn't fully on hand: read the gap and remember it.
  let fresh: Row[];
  if (fromKey > settledTo) {
    fresh = await fetch(fromKey, toKey);
  } else if (known && fromKey >= known.from && settledTo <= known.to) {
    fresh = settledTo < toKey ? await fetch(nextDay(settledTo), toKey) : [];
  } else if (known && fromKey >= known.from && fromKey <= nextDay(known.to) && settledTo > known.to) {
    // Days settled since the last read (a long admin session): read from the end of what is on hand.
    const rows = await fetch(nextDay(known.to), toKey);
    for (const r of rows) if (String(r.date || r.id) <= settledTo) known.rows.set(String(r.date || r.id), r);
    known.to = settledTo;
    fresh = rows.filter(r => String(r.date || r.id) > settledTo);
  } else if (known && fromKey < known.from && settledTo >= prevDay(known.from) && settledTo <= known.to) {
    // Asked further back than before: read only the older days, then the unsettled tail.
    const [older, tail] = await Promise.all([fetch(fromKey, prevDay(known.from)), settledTo < toKey ? fetch(nextDay(settledTo), toKey) : Promise.resolve([])]);
    for (const r of older) known.rows.set(String(r.date || r.id), r);
    known.from = fromKey;
    fresh = tail;
  } else {
    const all = await fetch(fromKey, toKey);
    if (gen !== generation) return all; // counts were reset meanwhile: don't keep what this read saw
    const settled = all.filter(r => String(r.date || r.id) <= settledTo);
    known = { from: fromKey, to: settledTo, rows: new Map(settled.map(r => [String(r.date || r.id), r])) };
    return all;
  }
  const settled = known && fromKey <= settledTo ? [...known.rows.values()].filter(r => { const d = String(r.date || r.id); return d >= fromKey && d <= settledTo; }) : [];
  return [...settled, ...fresh.filter(inside)].sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
}
