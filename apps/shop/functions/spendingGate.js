// Spending limits, the shop's side (platform plan 8.9, 13.4). The platform watches each shop's Google bill against a
// budget and writes the level it reached to `systemStatus/spending` ({ level: "normal" | "slow" | "held", at }). Past the
// budget the costly jobs slow down; far past it they wait until next month. Checkout, payment events and order emails are
// never gated: nothing here is called from them.
//
// The costly jobs and their pace are the same table as the platform's (services/health/spending.js COSTLY_JOBS); a test
// in the platform repo fails when the two differ. A shop with no level, or one this file cannot read, runs at full speed:
// a read problem never stops a job.
const { nextWindow } = require("./rateLimit");

const STATUS = ["systemStatus", "spending"];
const HOUR_MS = 60 * 60 * 1000;

const COSTLY_JOBS = Object.freeze({
  "photo-copies": Object.freeze({ perHour: 60, words: "photo copies" }),
  "ai-writing": Object.freeze({ perHour: 10, words: "AI writing" }),
  import: Object.freeze({ perHour: 2, words: "imports" }),
});

/** What a job may do at a level: { run, perHour (null = no limit), words }. */
function paceAt(level, job) {
  const costly = COSTLY_JOBS[job];
  if (!costly) return { run: true, perHour: null };
  if (level === "held") return { run: false, perHour: 0, words: `Your shop has used a lot more than usual this month, so ${costly.words} wait until next month. Everything else, checkout first, works as normal.` };
  if (level === "slow") return { run: true, perHour: costly.perHour, words: `Your shop has used more than usual this month, so ${costly.words} run more slowly until next month. Checkout works as normal.` };
  return { run: true, perHour: null };
}

/** The level the platform last wrote ("normal" when there is none or it cannot be read). */
async function readLevel(db) {
  try {
    const snap = await db.collection(STATUS[0]).doc(STATUS[1]).get();
    const level = snap.exists ? snap.data()?.level : "";
    return level === "slow" || level === "held" ? level : "normal";
  } catch {
    return "normal";
  }
}

/** The pace of a job now: { run, perHour, words }. For a scheduled pass, which counts its own work. */
async function paceOf(db, job) {
  return paceAt(await readLevel(db), job);
}

/**
 * One use of a job that is called one request at a time (AI writing): { allowed, words }. At "slow" the shop as a whole
 * gets `perHour` uses in a rolling hour (a counter in `rate-limits`); at "held" none; at "normal" it is not counted.
 */
async function allowOne(db, job, now = Date.now()) {
  const pace = await paceOf(db, job);
  if (!pace.run) return { allowed: false, words: pace.words };
  if (pace.perHour === null) return { allowed: true };
  const ref = db.collection("rate-limits").doc(`spend_${job}`);
  try {
    return await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const { allowed, record } = nextWindow(snap.exists ? snap.data() : null, now, { max: pace.perHour, windowMs: HOUR_MS });
      tx.set(ref, { ...record, bucket: `spend_${job}`, expiresAt: new Date(record.windowStart + HOUR_MS * 2) });
      return allowed ? { allowed: true } : { allowed: false, words: pace.words };
    });
  } catch {
    return { allowed: true };
  }
}

module.exports = { COSTLY_JOBS, paceAt, readLevel, paceOf, allowOne };
