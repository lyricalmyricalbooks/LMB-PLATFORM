// The rules behind the speed budget (plan 14.5), kept apart from the browser so a test can plant a slowdown.
// A page's measures: how many things it draws (nodes), and how many pictures it asks for (images). The budget for each is the stored number plus a margin, so ordinary change passes
// and a real slowdown fails. The stored numbers only go down.

export const MEASURES = ["nodes", "images"];
export const MARGIN = 0.15; // 15% room
export const FLOOR = { nodes: 40, images: 1 }; // never tighter than this much room

/** The most a measure may be, given what was stored. */
export function budgetFor(measure, stored) {
  return Math.ceil(stored + Math.max(stored * MARGIN, FLOOR[measure] ?? 1));
}

/** Compare what was measured with what was stored. Returns { over, improved, missing }. */
export function compare(found, baseline) {
  const over = [];
  const improved = [];
  const missing = [];
  for (const [key, measures] of Object.entries(found)) {
    const stored = baseline?.[key];
    if (!stored) { missing.push(key); continue; }
    for (const measure of MEASURES) {
      const now = measures[measure];
      const limit = budgetFor(measure, stored[measure]);
      if (now > limit) over.push({ key, measure, now, stored: stored[measure], limit });
      else if (now < stored[measure]) improved.push({ key, measure, now, stored: stored[measure] });
    }
  }
  return { over, improved, missing };
}

/** A baseline that keeps the lower of the old and new number for each measure. */
export function lowered(found, baseline) {
  const out = {};
  for (const [key, measures] of Object.entries(found)) {
    out[key] = Object.fromEntries(MEASURES.map((m) => [m, baseline?.[key] ? Math.min(baseline[key][m], measures[m]) : measures[m]]));
  }
  return out;
}

/** Plain words for a failure. */
export function describe({ key, measure, now, stored, limit }) {
  const what = { nodes: "pieces on the page", images: "pictures it asks for" }[measure];
  return `${key} now has ${now} ${what}; it had ${stored}, and the most we allow is ${limit}.`;
}
