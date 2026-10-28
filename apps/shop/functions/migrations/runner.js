// Numbered data changes for one shop (platform plan 4.2). Each change runs once per shop: what ran is written in the
// shop's own database, so running them again does nothing.
//
// Where it is kept: systemStatus/migrations (the admin can read it, no browser can write it; firestore.rules)
//   applied  { "<id>": { at, release, runId, description, result } }   one entry per change that finished
//   running  { runId, since, until } | null                           the run that holds the lock
//   failed   { id, error, at, runId } | null                          the last change that stopped a run
// and every finished or failed change also gets an audit-log entry (type "migration").
//
// A change is { id: "0001-short-name", description, run({ db, log, now }) } in list.js, numbered 0001, 0002… with no
// gaps. Rules for writing one:
// - It is only ever added at the end of list.js and never edited once released; a fix is a new change.
// - It must be safe to run again after stopping half-way (look before writing; write the same value twice).
// - The previous release's code must still work with the changed data, because a release that fails its checks is
//   rolled back by putting the old code back, never by undoing data.
// Changes run in order; the first one that fails stops the run, and the next run starts again at that one.
const ID = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCK_MINUTES = 30;

/** Problems with the list itself, in plain words. Empty when it is fine. */
function listProblems(migrations) {
  const problems = [];
  migrations.forEach((m, index) => {
    const match = ID.exec(m?.id ?? "");
    const want = String(index + 1).padStart(4, "0");
    if (!match) problems.push(`"${m?.id}" isn't named like 0001-short-name`);
    else if (match[1] !== want) problems.push(`${m.id} should be numbered ${want}`);
    if (typeof m?.run !== "function") problems.push(`${m?.id} has no run function`);
    if (typeof m?.description !== "string" || !m.description.trim()) problems.push(`${m?.id} has no description`);
  });
  return problems;
}

const message = error => (error instanceof Error ? error.message : String(error));

/**
 * runMigrations({ db, migrations, release, runId, dryRun, now, log }) ->
 *   { ok, applied: [ids run now], skipped: [ids already done], pending?: [ids] (dry run), failed?, error?, locked? }
 */
async function runMigrations({ db, migrations, release = null, runId, dryRun = false, now = () => new Date(), log = () => {}, lockMinutes = LOCK_MINUTES }) {
  const problems = listProblems(migrations);
  if (problems.length) throw new Error(`the list of data changes is wrong: ${problems.join("; ")}`);
  if (!runId) throw new Error("a run needs a runId");
  const ref = db.collection("systemStatus").doc("migrations");

  if (dryRun) {
    const snap = await ref.get();
    const done = (snap.exists && snap.data().applied) || {};
    const pending = migrations.filter(m => !done[m.id]).map(m => m.id);
    log(pending.length ? `Would run: ${pending.join(", ")}` : "Nothing to run.");
    return { ok: true, dryRun: true, applied: [], skipped: migrations.filter(m => done[m.id]).map(m => m.id), pending };
  }

  const lock = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const at = now();
    const held = data.running;
    if (held && held.runId !== runId && held.until > at.toISOString()) return { taken: false, held };
    const until = new Date(at.getTime() + lockMinutes * 60_000).toISOString();
    tx.set(ref, { running: { runId, since: at.toISOString(), until } }, { merge: true });
    return { taken: true, done: data.applied || {} };
  });
  if (!lock.taken) {
    log(`Another run (${lock.held.runId}) is changing this shop's data until ${lock.held.until}.`);
    return { ok: false, locked: true, applied: [], skipped: [] };
  }

  const applied = [];
  const skipped = [];
  const audit = entry => db.collection("audit-log").add({ type: "migration", createdAt: now().toISOString(), ...entry });
  try {
    for (const m of migrations) {
      if (lock.done[m.id]) {
        skipped.push(m.id);
        continue;
      }
      log(`Running ${m.id}: ${m.description}`);
      let result;
      try {
        result = await m.run({ db, log, now });
      } catch (error) {
        const failed = { id: m.id, error: message(error), at: now().toISOString(), runId };
        await ref.set({ failed }, { merge: true });
        await audit({ message: `Data change ${m.id} failed: ${failed.error}`, migration: m.id, release, runId });
        log(`${m.id} failed: ${failed.error}`);
        return { ok: false, applied, skipped, failed: m.id, error: failed.error };
      }
      const entry = { at: now().toISOString(), release, runId, description: m.description, result: result ?? null };
      await ref.set({ applied: { [m.id]: entry }, failed: null }, { merge: true });
      await audit({ message: `Data change ${m.id} done: ${m.description}`, migration: m.id, release, runId });
      applied.push(m.id);
    }
    return { ok: true, applied, skipped };
  } finally {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().running?.runId === runId) tx.set(ref, { running: null }, { merge: true });
    });
  }
}

module.exports = { runMigrations, listProblems, LOCK_MINUTES };
