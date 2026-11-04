// One scheduled "tick" instead of ten Cloud Scheduler jobs (platform code plan 15.16). Google bills every scheduler
// job after the free three, and a shop that sells nothing still paid for ten. Each sweep is registered here with the
// schedule it always had; one job wakes every five minutes, runs the sweeps that are due and remembers when each last
// ran in `systemStatus/tick`. A sweep that fails is recorded and is not repeated until its next due time.

const TICK_EVERY_MINUTES = 5;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "every 15 minutes" | "every 3 hours" | "every day 08:00" | "every monday 08:00" -> a plain description. */
function parseSchedule(schedule, timeZone = "UTC") {
  const text = String(schedule || "").trim().toLowerCase();
  let m = text.match(/^every (\d+) (minute|minutes|hour|hours)$/);
  if (m) {
    const n = Number(m[1]);
    if (n < 1) throw new Error(`Bad schedule "${schedule}"`);
    return { kind: "interval", ms: n * (m[2].startsWith("hour") ? 3600000 : 60000), timeZone };
  }
  m = text.match(/^every (day|sunday|monday|tuesday|wednesday|thursday|friday|saturday) (\d{1,2}):(\d{2})$/);
  if (m) {
    const hour = Number(m[2]);
    const minute = Number(m[3]);
    if (hour > 23 || minute > 59) throw new Error(`Bad schedule "${schedule}"`);
    return { kind: m[1] === "day" ? "daily" : "weekly", weekday: DAYS.indexOf(m[1]), hour, minute, timeZone };
  }
  throw new Error(`Unsupported schedule "${schedule}"`);
}

function localParts(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return { y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day), h: Number(parts.hour), mi: Number(parts.minute) };
}

/** Milliseconds the zone is ahead of UTC at this moment. */
function offsetAt(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000;
}

/** The UTC moment of a local wall-clock time in the zone. */
function zonedToUtc(y, mo, d, h, mi, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - offsetAt(guess - offsetAt(guess, timeZone), timeZone);
}

/** The latest moment at or before `nowMs` that a daily or weekly sweep should have run. */
function lastOccurrence(spec, nowMs) {
  const today = localParts(nowMs, spec.timeZone);
  for (let back = 0; back < 8; back++) {
    const day = new Date(Date.UTC(today.y, today.mo - 1, today.d - back));
    if (spec.kind === "weekly" && day.getUTCDay() !== spec.weekday) continue;
    const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), spec.hour, spec.minute, spec.timeZone);
    if (at <= nowMs) return at;
  }
  return 0;
}

/**
 * Should this sweep run now? `lastRunMs` is when the tick last ran it (0 when never).
 * A daily or weekly sweep that has never run waits for its next time instead of firing at once.
 */
function isDue(spec, nowMs, lastRunMs) {
  if (spec.kind === "interval") return !lastRunMs || nowMs - lastRunMs >= spec.ms - 30000;
  if (!lastRunMs) return false;
  return lastOccurrence(spec, nowMs) > lastRunMs;
}

/** Collects sweeps in place of Cloud Scheduler jobs. `register` has the shape of `onSchedule` and returns the handler. */
function createTickRegistry() {
  const jobs = [];
  const register = (options, handler) => {
    if (!options || !options.name) throw new Error("Every scheduled job needs a name");
    if (jobs.some(j => j.name === options.name)) throw new Error(`Scheduled job "${options.name}" is registered twice`);
    jobs.push({ name: options.name, spec: parseSchedule(options.schedule, options.timeZone), secrets: options.secrets || [], timeoutSeconds: options.timeoutSeconds, handler });
    // The sweep keeps the options it declared (its secrets, memory), which the tests read.
    if (typeof handler === "function") handler.__opts = options;
    return handler;
  };
  return { jobs, register, secrets: () => [...new Set(jobs.flatMap(j => j.secrets))] };
}

/** How long the tick itself may run (index.js `exports.tick`); a sweep's running mark older than this is a crashed run. */
const TICK_TIMEOUT_SECONDS = 1800;

/**
 * Runs every sweep that is due and records the outcome. Never throws for one sweep's failure.
 * Ticks can overlap (a slow sweep keeps one running past the next five-minute wake), so the due sweeps are claimed in
 * one transaction against fresh state before any runs: a sweep another tick is still running (its `running` mark is
 * younger than its timeout) is skipped, and each sweep writes back only its own entry, never a stale copy of the rest.
 */
async function runTick({ jobs, db, now = Date.now(), log = console }) {
  const ref = db.collection("systemStatus").doc("tick");
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const state = (snap && snap.exists && snap.data() && snap.data().jobs) || {};
    const marks = {};
    const due = [];
    for (const job of jobs) {
      const entry = state[job.name] || {};
      const timeoutMs = (Number(job.timeoutSeconds) || TICK_TIMEOUT_SECONDS) * 1000;
      if (entry.running && now - entry.running < timeoutMs) continue;
      const last = entry.at || 0;
      if (!isDue(job.spec, now, last)) {
        if (!last && job.spec.kind !== "interval") marks[job.name] = { at: now, ok: true, started: true };
        continue;
      }
      marks[job.name] = { running: now };
      due.push(job);
    }
    tx.set(ref, { jobs: marks, lastTickAt: now }, { merge: true });
    return due;
  });
  const ran = [];
  await Promise.all(claimed.map(async job => {
    let record;
    try {
      await job.handler();
      record = { at: now, ok: true, error: null, running: null };
    } catch (err) {
      log.error(`tick: ${job.name} failed:`, err && err.message);
      record = { at: now, ok: false, error: String((err && err.message) || err).slice(0, 300), running: null };
    }
    ran.push(job.name);
    await ref.set({ jobs: { [job.name]: record } }, { merge: true })
      .catch(err => log.error(`tick: could not record ${job.name}:`, err && err.message));
  }));
  return { ran };
}

module.exports = { TICK_EVERY_MINUTES, TICK_TIMEOUT_SECONDS, parseSchedule, isDue, lastOccurrence, createTickRegistry, runTick };
