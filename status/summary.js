// The public status of the platform (plan 4.4), made from the health run's results on every registry row
// (services/health). It names no shop: only how many shops each part is working for. The page (index.html) shows it;
// publish.js saves it where the page can read it. Runs in Node and in the browser.

export const PARTS = Object.freeze([
  { id: "pages", name: "Shop and stockroom pages" },
  { id: "checkout", name: "Checkout" },
  { id: "webhook", name: "Payments" },
  { id: "backup", name: "Backups" },
]);

// Checks run every five minutes; a summary older than this means the checks themselves have stopped.
export const STALE_MINUTES = 20;

/** "working" | "some" (some shops affected) | "most" (half or more affected) | "none" (no shop uses it yet). */
function partState(failing, total) {
  if (!total) return "none";
  if (!failing) return "working";
  return failing * 2 >= total ? "most" : "some";
}

/**
 * `statusSummary(rows, { now })` -> { updatedAt, overall, parts: [{ id, name, state, affected, total }] }.
 * `overall`: "working", "some" (a part has trouble for some shops) or "most" (a part has trouble for half or more).
 */
export function statusSummary(rows, { now = () => new Date() } = {}) {
  const live = rows.filter((row) => row?.status === "live" && row.health?.checks);
  const parts = PARTS.map(({ id, name }) => {
    const states = live.map((row) => row.health.checks[id]).filter(Boolean);
    const affected = states.filter((state) => !state.ok).length;
    return { id, name, state: partState(affected, states.length), affected, total: states.length };
  });
  const rank = { none: 0, working: 0, some: 1, most: 2 };
  const worst = Math.max(0, ...parts.map((part) => rank[part.state]));
  const checkedAt = live.map((row) => row.health.checkedAt).filter(Boolean).sort().at(-1) ?? null;
  return { updatedAt: now().toISOString(), checkedAt, overall: ["working", "some", "most"][worst], parts };
}

/** What the page says for a summary, in plain words. `now` lets the page notice a summary that stopped updating. */
export function statusWords(summary, { now = () => new Date() } = {}) {
  if (!summary?.checkedAt) return { headline: "Status checks haven't started yet.", tone: "quiet", parts: [] };
  const minutes = (now().getTime() - Date.parse(summary.checkedAt)) / 60_000;
  const late = minutes > STALE_MINUTES;
  const headline = late
    ? "We can't confirm the current status: the checks haven't reported recently."
    : { working: "Everything is working.", some: "Some shops are having trouble.", most: "We're having a problem across shops." }[summary.overall];
  const tone = late ? "quiet" : { working: "good", some: "warn", most: "bad" }[summary.overall];
  const parts = summary.parts.filter((part) => part.state !== "none").map((part) => ({
    name: part.name,
    state: part.state,
    words: part.state === "working" ? "Working" : `Trouble for ${part.affected} of ${part.total} shops`,
  }));
  return { headline, tone, parts, checkedAt: summary.checkedAt };
}
