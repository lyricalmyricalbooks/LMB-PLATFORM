// Count stock (v4 mockup 1k): a shelf check. Each row has the stock the shop expects; the owner counts what is really
// there. Pure rules here, the page in CountStock.tsx. Finishing sets every counted row to its count ("Count correction").

export type CountRow = { id: string; expected: number };
/** What the owner has counted so far, by row id (rows not started are absent). */
export type Counts = Record<string, number>;

export type CountSummary = { total: number; counted: number; left: number; differences: number; net: number; changes: { id: string; from: number; to: number }[] };

export function countSummary(rows: CountRow[], counts: Counts): CountSummary {
  let counted = 0, net = 0;
  const changes: CountSummary["changes"] = [];
  for (const r of rows) {
    const n = counts[r.id];
    if (n === undefined || !Number.isFinite(n)) continue;
    counted++;
    if (n !== r.expected) { changes.push({ id: r.id, from: r.expected, to: n }); net += n - r.expected; }
  }
  return { total: rows.length, counted, left: rows.length - counted, differences: changes.length, net, changes };
}

/** "Matches", "+3", "−2" or "Not counted". */
export function differenceText(expected: number, counted: number | undefined): string {
  if (counted === undefined) return "Not counted";
  const d = counted - expected;
  return d === 0 ? "Matches" : `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

/** The status bar's words: blocked until every row is counted, then what finishing will change. */
export function countStatus(s: CountSummary, noun = "item"): { tone: "good" | "warn"; text: string; blocked: boolean } {
  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  if (s.left > 0) return { tone: "warn", text: `${plural(s.left)} not counted yet`, blocked: true };
  if (s.differences > 0) return { tone: "warn", text: `Finishing will correct ${plural(s.differences)}`, blocked: false };
  return { tone: "good", text: "Everything matches", blocked: false };
}

/** Saved progress ("Save for later"): kept in this browser only, keyed to the rows still in the list. */
export type CountSession = { startedAt: number; counts: Counts };
const KEY = "lm:count-session";
export function readCountSession(): CountSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw.startedAt !== "number" || typeof raw.counts !== "object" || !raw.counts) return null;
    const counts: Counts = {};
    for (const [id, v] of Object.entries(raw.counts)) if (Number.isInteger(v) && (v as number) >= 0) counts[id] = v as number;
    return { startedAt: raw.startedAt, counts };
  } catch { return null; }
}
export function writeCountSession(s: CountSession | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage blocked: progress lasts this visit */ }
}

/** The difference report shown after a count: what changed, by how many, and what that is worth at cost price. */
export type ReportItem = { id: string; title: string; sub?: string; cost?: number };
export type ReportRow = { id: string; title: string; sub: string; from: number; to: number; diff: number; value: number | null };
export type CountReport = { rows: ReportRow[]; missing: number; found: number; valueMissing: number; valueFound: number; noCost: number; matched: number };

export function countReport(items: ReportItem[], changes: { id: string; from: number; to: number }[], counted: number): CountReport {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows: ReportRow[] = [];
  let missing = 0, found = 0, valueMissing = 0, valueFound = 0, noCost = 0;
  for (const c of changes) {
    const it = byId.get(c.id);
    const diff = c.to - c.from;
    const cost = it?.cost && it.cost > 0 ? it.cost : null;
    const value = cost === null ? null : Math.round(diff * cost * 100) / 100;
    if (diff < 0) { missing -= diff; if (value !== null) valueMissing -= value; }
    else { found += diff; if (value !== null) valueFound += value; }
    if (value === null) noCost++;
    rows.push({ id: c.id, title: it?.title || c.id, sub: it?.sub || "", from: c.from, to: c.to, diff, value });
  }
  // Biggest loss first: what the owner most needs to look into.
  rows.sort((a, b) => (a.value ?? a.diff) - (b.value ?? b.diff) || a.diff - b.diff || a.title.localeCompare(b.title));
  const round = (n: number) => Math.round(n * 100) / 100;
  return { rows, missing, found, valueMissing: round(valueMissing), valueFound: round(valueFound), noCost, matched: Math.max(0, counted - rows.length) };
}

/** The report as spreadsheet rows (header first), for "Download report". */
export function countReportRows(report: CountReport, countedAt: string): string[][] {
  return [
    ["Counted", "Item", "Details", "Expected", "Counted", "Difference", "Value at cost"],
    ...report.rows.map((r) => [countedAt, r.title, r.sub, String(r.from), String(r.to), String(r.diff), r.value === null ? "" : r.value.toFixed(2)]),
  ];
}
