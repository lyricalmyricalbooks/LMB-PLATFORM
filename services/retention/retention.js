// How long the platform keeps what it records about presses and about itself (plan 13.8; the list in words is
// docs/keep-times.md). A nightly job deletes records older than their keep-time, a batch at a time, oldest first, and
// writes one line on the platform's state saying what it did. Nothing here names orders, customers, billing or tax
// records: those are kept (retention.test.js checks), and closed shops follow their own timeline (billing/closing.js, 6.8).
//
//   runRetention({ firestore, registry, now, print }) -> { removed: { <rule name>: n }, ok }
//
// A rule is a collection (or, with `perShop`, a sub-collection of every shop's registry row), the field that holds an ISO
// time, and the days to keep.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const BATCH = 300;

export const KEEP = Object.freeze([
  { name: "control room activity", collection: "controlActivity", field: "at", days: 365 },
  { name: "account recovery requests", collection: "recoveries", field: "askedAt", days: 730 },
  { name: "shop history", perShop: "events", field: "at", days: 730 },
  { name: "setup step history", perShop: "steps", field: "recordedAt", days: 730 },
]);

/** What is deliberately never deleted by this job. A test fails if a rule names one. */
export const NEVER = Object.freeze(["orders", "customers", "billing", "invoices", "payments", "shops", "waitlist", "invites", "terms"]);

const message = (error) => (error instanceof Error ? error.message : String(error));

async function pruneOne(firestore, collection, field, cutoff) {
  const rows = await firestore.query(collection, { where: [[field, "<", cutoff]], orderBy: [[field, "asc"]], limit: BATCH });
  let removed = 0;
  for (const row of rows) if (await firestore.remove(row.path)) removed += 1;
  return removed;
}

export async function runRetention({ firestore, registry, now = () => new Date(), print = () => {}, rules = KEEP }) {
  const removed = {};
  const problems = [];
  const shops = rules.some((rule) => rule.perShop) ? (await registry.listShops()).map((row) => row.shopId) : [];
  for (const rule of rules) {
    const cutoff = new Date(now().getTime() - rule.days * DAY_MS).toISOString();
    removed[rule.name] = 0;
    const places = rule.perShop ? shops.map((id) => `shops/${id}/${rule.perShop}`) : [rule.collection];
    for (const place of places) {
      try {
        removed[rule.name] += await pruneOne(firestore, place, rule.field, cutoff);
      } catch (error) {
        problems.push(`${place}: ${message(error)}`);
        print(`retention: ${place} failed: ${message(error)}`);
      }
    }
  }
  const at = now().toISOString();
  try {
    await firestore.set("platformState/retention", { at, removed, ok: problems.length === 0, ...(problems.length ? { problems: problems.slice(0, 10) } : {}) });
  } catch (error) {
    print(`retention: couldn't write the result: ${message(error)}`);
  }
  return { ok: problems.length === 0, removed, problems };
}
